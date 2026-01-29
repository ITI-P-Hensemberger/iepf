// Purpose: Admin-only stats handlers.
import type { Context } from 'hono'

import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { classSections } from '@/db/schemas/class-sections.schema'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
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
  const countedLessonsExpr = sql<number>`count(${lessons.id})`
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
      countedLessons: countedLessonsExpr
    })
    .from(users)
    .leftJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .leftJoin(classSections, eq(classSections.id, tutorProfiles.sectionId))
    .leftJoin(
      lessons,
      and(
        eq(lessons.tutorId, users.id),
        eq(lessons.countsForTutor, true)
      )
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
  const countedLessonsExpr = sql<number>`count(${lessonBookings.id})`
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
      countedLessons: countedLessonsExpr
    })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .leftJoin(classSections, eq(classSections.id, studentProfiles.sectionId))
    .leftJoin(
      lessonBookings,
      and(
        eq(lessonBookings.studentId, users.id),
        eq(lessonBookings.countsForStudent, true)
      )
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
