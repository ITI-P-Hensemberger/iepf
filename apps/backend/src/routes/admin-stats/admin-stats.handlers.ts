// Purpose: Admin-only stats handlers.
import type { Context } from 'hono'

import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { classSections } from '@/db/schemas/class-sections.schema'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tutorInviteTokens } from '@/db/schemas/tutor-invite-tokens.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type {
  GetConfirmedBookingsCountRoute,
  GetConfirmedLessonsCountRoute,
  GetFeedbackSummaryRoute,
  GetStudentStatusCountsRoute,
  GetTutorStatusCountsRoute,
  ListStudentLessonCountsRoute,
  ListSubjectTutorCountsRoute,
  ListTutorLessonCountsRoute
} from './admin-stats.routes'

type HandlerContext = Context<AppBindings>

function forbid(): never {
  throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
    message: HttpStatusPhrases.FORBIDDEN
  })
}

function ensureAdmin(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    forbid()
  }
  return currentUser
}

export const listSubjectTutorCounts: AppRouteHandler<ListSubjectTutorCountsRoute> = async (c) => {
  ensureAdmin(c)

  const { q, sortBy, sortDir, limit, offset } = c.req.valid('query')
  const tutorCountExpr = sql<number>`count(${tutorSubjects.tutorId})`
  const subjectFilter = q
    ? or(
        ilike(subjects.name, `%${q}%`),
        ilike(subjects.canonicalName, `%${q}%`)
      )
    : undefined
  const sortColumn = sortBy === 'tutorCount'
    ? tutorCountExpr
    : sortBy === 'canonicalName'
      ? subjects.canonicalName
      : subjects.name

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(subjects)
    .where(subjectFilter)

  const rows = await db
    .select({
      subjectId: subjects.id,
      name: subjects.name,
      canonicalName: subjects.canonicalName,
      tutorCount: tutorCountExpr
    })
    .from(subjects)
    .leftJoin(tutorSubjects, eq(tutorSubjects.subjectId, subjects.id))
    .where(subjectFilter)
    .groupBy(subjects.id)
    .orderBy(
      (sortDir === 'desc' ? desc : asc)(sortColumn)
    )
    .limit(limit)
    .offset(offset)

  return c.json(
    {
      data: rows,
      total: Number(totalRow?.total ?? 0),
      limit,
      offset
    },
    HttpStatusCodes.OK
  )
}

export const listTutorLessonCounts: AppRouteHandler<ListTutorLessonCountsRoute> = async (c) => {
  ensureAdmin(c)

  const { q, sortBy, sortDir, limit, offset } = c.req.valid('query')
  const countedLessonsExpr = sql<number>`count(case when ${lessons.countsForTutor} = true then 1 end)`
  const lessonsScheduledCountedExpr = sql<number>`count(case when ${lessons.status} = 'scheduled' and ${lessons.countsForTutor} = true then 1 end)`
  const lessonsScheduledNotCountedExpr = sql<number>`count(case when ${lessons.status} = 'scheduled' and ${lessons.countsForTutor} = false then 1 end)`
  const lessonsConfirmedCountedExpr = sql<number>`count(case when ${lessons.status} = 'confirmed' and ${lessons.countsForTutor} = true then 1 end)`
  const lessonsConfirmedNotCountedExpr = sql<number>`count(case when ${lessons.status} = 'confirmed' and ${lessons.countsForTutor} = false then 1 end)`
  const lessonsCancelledCountedExpr = sql<number>`count(case when ${lessons.status} = 'canceled' and ${lessons.countsForTutor} = true then 1 end)`
  const lessonsCancelledNotCountedExpr = sql<number>`count(case when ${lessons.status} = 'canceled' and ${lessons.countsForTutor} = false then 1 end)`
  const lessonsCompletedCountedExpr = sql<number>`count(case when ${lessons.status} = 'completed' and ${lessons.countsForTutor} = true then 1 end)`
  const lessonsCompletedNotCountedExpr = sql<number>`count(case when ${lessons.status} = 'completed' and ${lessons.countsForTutor} = false then 1 end)`
  const tutorConditions = [eq(users.role, 'tutor')]
  if (q) {
    const searchCondition = or(
      ilike(users.firstName, `%${q}%`),
      ilike(users.lastName, `%${q}%`),
      ilike(users.email, `%${q}%`),
      ilike(classSections.name, `%${q}%`)
    )
    if (searchCondition) {
      tutorConditions.push(searchCondition)
    }
  }
  const tutorFilter = and(...tutorConditions)
  const sortOrder = sortDir === 'desc' ? desc : asc
  const orderByExpr = (() => {
    switch (sortBy) {
      case 'countedLessons':
        return sortOrder(countedLessonsExpr)
      case 'firstName':
        return sortOrder(users.firstName)
      case 'email':
        return sortOrder(users.email)
      case 'sectionName':
        return sortOrder(classSections.name)
      case 'lastName':
      default:
        return sortOrder(users.lastName)
    }
  })()

  const [totalRow] = await db
    .select({ total: sql<number>`count(distinct ${users.id})` })
    .from(users)
    .leftJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .leftJoin(classSections, eq(classSections.id, tutorProfiles.sectionId))
    .where(tutorFilter)

  const rows = await db
    .select({
      tutorId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      sectionName: classSections.name,
      countedLessons: countedLessonsExpr,
      lessonsScheduledCounted: lessonsScheduledCountedExpr,
      lessonsScheduledNotCounted: lessonsScheduledNotCountedExpr,
      lessonsConfirmedCounted: lessonsConfirmedCountedExpr,
      lessonsConfirmedNotCounted: lessonsConfirmedNotCountedExpr,
      lessonsCancelledCounted: lessonsCancelledCountedExpr,
      lessonsCancelledNotCounted: lessonsCancelledNotCountedExpr,
      lessonsCompletedCounted: lessonsCompletedCountedExpr,
      lessonsCompletedNotCounted: lessonsCompletedNotCountedExpr
    })
    .from(users)
    .leftJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .leftJoin(classSections, eq(classSections.id, tutorProfiles.sectionId))
    .leftJoin(
      lessons,
      eq(lessons.tutorId, users.id)
    )
    .where(tutorFilter)
    .groupBy(users.id, classSections.name)
    .orderBy(orderByExpr, users.firstName)
    .limit(limit)
    .offset(offset)

  return c.json(
    {
      data: rows,
      total: Number(totalRow?.total ?? 0),
      limit,
      offset
    },
    HttpStatusCodes.OK
  )
}

export const listStudentLessonCounts: AppRouteHandler<ListStudentLessonCountsRoute> = async (c) => {
  ensureAdmin(c)

  const { q, sortBy, sortDir, limit, offset } = c.req.valid('query')
  const countedLessonsExpr = sql<number>`count(case when ${lessonBookings.countsForStudent} = true then 1 end)`
  const lessonsPresentCountedExpr = sql<number>`count(case when ${lessonBookings.studentPresence} = true and ${lessonBookings.countsForStudent} = true then 1 end)`
  const lessonsPresentNotCountedExpr = sql<number>`count(case when ${lessonBookings.studentPresence} = true and ${lessonBookings.countsForStudent} = false then 1 end)`
  const lessonsAbsentCountedExpr = sql<number>`count(case when ${lessonBookings.studentPresence} = false and ${lessonBookings.countsForStudent} = true then 1 end)`
  const lessonsAbsentNotCountedExpr = sql<number>`count(case when ${lessonBookings.studentPresence} = false and ${lessonBookings.countsForStudent} = false then 1 end)`
  const lessonsWithoutPresenceCountedExpr = sql<number>`count(case when ${lessonBookings.studentPresence} is null and ${lessonBookings.countsForStudent} = true then 1 end)`
  const lessonsWithoutPresenceNotCountedExpr = sql<number>`count(case when ${lessonBookings.studentPresence} is null and ${lessonBookings.countsForStudent} = false then 1 end)`
  const studentConditions = [eq(users.role, 'student')]
  if (q) {
    const searchCondition = or(
      ilike(users.firstName, `%${q}%`),
      ilike(users.lastName, `%${q}%`),
      ilike(users.email, `%${q}%`),
      ilike(classSections.name, `%${q}%`)
    )
    if (searchCondition) {
      studentConditions.push(searchCondition)
    }
  }
  const studentFilter = and(...studentConditions)
  const sortOrder = sortDir === 'desc' ? desc : asc
  const orderByExpr = (() => {
    switch (sortBy) {
      case 'countedLessons':
        return sortOrder(countedLessonsExpr)
      case 'firstName':
        return sortOrder(users.firstName)
      case 'email':
        return sortOrder(users.email)
      case 'sectionName':
        return sortOrder(classSections.name)
      case 'lastName':
      default:
        return sortOrder(users.lastName)
    }
  })()

  const [totalRow] = await db
    .select({ total: sql<number>`count(distinct ${users.id})` })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .leftJoin(classSections, eq(classSections.id, studentProfiles.sectionId))
    .where(studentFilter)

  const rows = await db
    .select({
      studentId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      sectionName: classSections.name,
      countedLessons: countedLessonsExpr,
      lessonsPresentCounted: lessonsPresentCountedExpr,
      lessonsPresentNotCounted: lessonsPresentNotCountedExpr,
      lessonsAbsentCounted: lessonsAbsentCountedExpr,
      lessonsAbsentNotCounted: lessonsAbsentNotCountedExpr,
      lessonsWithoutPresenceCounted: lessonsWithoutPresenceCountedExpr,
      lessonsWithoutPresenceNotCounted: lessonsWithoutPresenceNotCountedExpr
    })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .leftJoin(classSections, eq(classSections.id, studentProfiles.sectionId))
    .leftJoin(
      lessonBookings,
      eq(lessonBookings.studentId, users.id)
    )
    .where(studentFilter)
    .groupBy(users.id, classSections.name)
    .orderBy(orderByExpr, users.firstName)
    .limit(limit)
    .offset(offset)

  return c.json(
    {
      data: rows,
      total: Number(totalRow?.total ?? 0),
      limit,
      offset
    },
    HttpStatusCodes.OK
  )
}

export const getConfirmedLessonsCount: AppRouteHandler<GetConfirmedLessonsCountRoute> = async (c) => {
  ensureAdmin(c)

  const [row] = await db
    .select({
      total: sql<number>`count(*)`
    })
    .from(lessons)
    .where(eq(lessons.status, 'confirmed'))

  return c.json({ total: Number(row?.total ?? 0) }, HttpStatusCodes.OK)
}

export const getConfirmedBookingsCount: AppRouteHandler<GetConfirmedBookingsCountRoute> = async (c) => {
  ensureAdmin(c)

  const [row] = await db
    .select({
      total: sql<number>`count(*)`
    })
    .from(lessonBookings)
    .where(eq(lessonBookings.status, 'confirmed'))

  return c.json({ total: Number(row?.total ?? 0) }, HttpStatusCodes.OK)
}

export const getStudentStatusCounts: AppRouteHandler<GetStudentStatusCountsRoute> = async (c) => {
  ensureAdmin(c)

  const [activeRow, inactiveRow, pendingRow] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .where(and(eq(users.role, 'student'), eq(studentProfiles.isActive, true))),
    db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .where(and(eq(users.role, 'student'), eq(studentProfiles.isActive, false))),
    db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, 'student'), isNull(users.emailVerifiedAt)))
  ])

  return c.json(
    {
      active: Number(activeRow?.[0]?.total ?? 0),
      inactive: Number(inactiveRow?.[0]?.total ?? 0),
      pendingEmailVerification: Number(pendingRow?.[0]?.total ?? 0)
    },
    HttpStatusCodes.OK
  )
}

export const getTutorStatusCounts: AppRouteHandler<GetTutorStatusCountsRoute> = async (c) => {
  ensureAdmin(c)

  const [activeRow, inactiveRow, invitesRow] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
      .where(and(eq(users.role, 'tutor'), eq(tutorProfiles.isActive, true))),
    db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
      .where(and(eq(users.role, 'tutor'), eq(tutorProfiles.isActive, false))),
    db
      .select({ total: sql<number>`count(*)` })
      .from(tutorInviteTokens)
  ])

  return c.json(
    {
      active: Number(activeRow?.[0]?.total ?? 0),
      inactive: Number(inactiveRow?.[0]?.total ?? 0),
      invites: Number(invitesRow?.[0]?.total ?? 0)
    },
    HttpStatusCodes.OK
  )
}

export const getFeedbackSummary: AppRouteHandler<GetFeedbackSummaryRoute> = async (c) => {
  ensureAdmin(c)

  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      studentAuthored: sql<number>`count(case when ${lessonFeedback.authorRole} = 'student' then 1 end)`,
      tutorAuthored: sql<number>`count(case when ${lessonFeedback.authorRole} = 'tutor' then 1 end)`,
      averageRating: sql<number>`coalesce(avg(${lessonFeedback.rating}), 0)`,
      rating1: sql<number>`count(case when ${lessonFeedback.rating} = 1 then 1 end)`,
      rating2: sql<number>`count(case when ${lessonFeedback.rating} = 2 then 1 end)`,
      rating3: sql<number>`count(case when ${lessonFeedback.rating} = 3 then 1 end)`,
      rating4: sql<number>`count(case when ${lessonFeedback.rating} = 4 then 1 end)`,
      rating5: sql<number>`count(case when ${lessonFeedback.rating} = 5 then 1 end)`,
      studentToTutorTotal: sql<number>`count(case when ${lessonFeedback.authorRole} = 'student' then 1 end)`,
      studentToTutorAverageRating: sql<number>`coalesce(avg(case when ${lessonFeedback.authorRole} = 'student' then ${lessonFeedback.rating} end), 0)`,
      studentToTutorRating1: sql<number>`count(case when ${lessonFeedback.authorRole} = 'student' and ${lessonFeedback.rating} = 1 then 1 end)`,
      studentToTutorRating2: sql<number>`count(case when ${lessonFeedback.authorRole} = 'student' and ${lessonFeedback.rating} = 2 then 1 end)`,
      studentToTutorRating3: sql<number>`count(case when ${lessonFeedback.authorRole} = 'student' and ${lessonFeedback.rating} = 3 then 1 end)`,
      studentToTutorRating4: sql<number>`count(case when ${lessonFeedback.authorRole} = 'student' and ${lessonFeedback.rating} = 4 then 1 end)`,
      studentToTutorRating5: sql<number>`count(case when ${lessonFeedback.authorRole} = 'student' and ${lessonFeedback.rating} = 5 then 1 end)`,
      tutorToStudentTotal: sql<number>`count(case when ${lessonFeedback.authorRole} = 'tutor' then 1 end)`,
      tutorToStudentAverageRating: sql<number>`coalesce(avg(case when ${lessonFeedback.authorRole} = 'tutor' then ${lessonFeedback.rating} end), 0)`,
      tutorToStudentRating1: sql<number>`count(case when ${lessonFeedback.authorRole} = 'tutor' and ${lessonFeedback.rating} = 1 then 1 end)`,
      tutorToStudentRating2: sql<number>`count(case when ${lessonFeedback.authorRole} = 'tutor' and ${lessonFeedback.rating} = 2 then 1 end)`,
      tutorToStudentRating3: sql<number>`count(case when ${lessonFeedback.authorRole} = 'tutor' and ${lessonFeedback.rating} = 3 then 1 end)`,
      tutorToStudentRating4: sql<number>`count(case when ${lessonFeedback.authorRole} = 'tutor' and ${lessonFeedback.rating} = 4 then 1 end)`,
      tutorToStudentRating5: sql<number>`count(case when ${lessonFeedback.authorRole} = 'tutor' and ${lessonFeedback.rating} = 5 then 1 end)`
    })
    .from(lessonFeedback)

  return c.json(
    {
      total: Number(row?.total ?? 0),
      studentAuthored: Number(row?.studentAuthored ?? 0),
      tutorAuthored: Number(row?.tutorAuthored ?? 0),
      averageRating: Number(row?.averageRating ?? 0),
      rating1: Number(row?.rating1 ?? 0),
      rating2: Number(row?.rating2 ?? 0),
      rating3: Number(row?.rating3 ?? 0),
      rating4: Number(row?.rating4 ?? 0),
      rating5: Number(row?.rating5 ?? 0),
      studentToTutorTotal: Number(row?.studentToTutorTotal ?? 0),
      studentToTutorAverageRating: Number(row?.studentToTutorAverageRating ?? 0),
      studentToTutorRating1: Number(row?.studentToTutorRating1 ?? 0),
      studentToTutorRating2: Number(row?.studentToTutorRating2 ?? 0),
      studentToTutorRating3: Number(row?.studentToTutorRating3 ?? 0),
      studentToTutorRating4: Number(row?.studentToTutorRating4 ?? 0),
      studentToTutorRating5: Number(row?.studentToTutorRating5 ?? 0),
      tutorToStudentTotal: Number(row?.tutorToStudentTotal ?? 0),
      tutorToStudentAverageRating: Number(row?.tutorToStudentAverageRating ?? 0),
      tutorToStudentRating1: Number(row?.tutorToStudentRating1 ?? 0),
      tutorToStudentRating2: Number(row?.tutorToStudentRating2 ?? 0),
      tutorToStudentRating3: Number(row?.tutorToStudentRating3 ?? 0),
      tutorToStudentRating4: Number(row?.tutorToStudentRating4 ?? 0),
      tutorToStudentRating5: Number(row?.tutorToStudentRating5 ?? 0)
    },
    HttpStatusCodes.OK
  )
}
