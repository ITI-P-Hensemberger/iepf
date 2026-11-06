// Purpose: Lesson booking handlers enforcing availability and token rules.
import type { SQL } from 'drizzle-orm'
import type { Context } from 'hono'

import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { randomUUID } from 'node:crypto'

import type { BookingOutcome } from '@/lib/analytics'
import type { DbExecutor, DbTransaction } from '@/lib/lesson-tokens'
import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import { notifyAbsence, notifyLateCancellation } from '@/lib/admin-notifications'
import { countInBackground } from '@/lib/analytics'
import {
  buildLessonBookingCanceledMessage,
  buildLessonBookingConfirmedMessage,
  buildLessonCanceledMessage,
  buildLessonCreatedMessage,
  buildLessonPresenceUpdatedMessage,
  buildLessonReassignedMessage,
  buildLessonRescheduledMessage
} from '@/lib/email-templates'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { getStudentTokenBalance, lockUsers } from '@/lib/lesson-tokens'
import { sendMail } from '@/lib/mailer'
import { buildPagedResponse } from '@/lib/pagination'
import { containsProfanity } from '@/lib/profanity'
import { notifyUsers } from '@/lib/push'
import { bookingCanceledPush, bookingConfirmedPush, lessonAssignedPush, lessonCanceledPush, lessonChangedPush, lessonCreatedPush, lessonReassignedPush } from '@/lib/push-messages'
import { addDays, bookingCutoff, isSameSchoolDay, schoolDayKey, schoolDayRange, schoolTime } from '@/lib/school-time'
import { tutorCanTeachStudent } from '@/lib/school-years'

import type {
  BookGeneratedLessonRoute,
  CancelBookingRoute,
  CancelLessonRoute,
  CreateLessonRoute,
  GetLessonRoute,
  ListAvailableLessonsRoute,
  ListLessonBookingsRoute,
  ListLessonsRoute,
  ListMyLessonsRoute,
  RescheduleLessonRoute,
  SetBookingPresenceRoute,
  UpdateBookingCountsRoute,
  UpdateBookingTopicRoute,
  UpdateLessonCountsRoute
} from './lessons.routes'

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

function buildClassLabel(sectionName: string | null, sectionId: string | null, year: number | null) {
  const sectionLabel = sectionName ?? sectionId
  const yearLabel = year ? `anno ${year}` : null
  if (sectionLabel && yearLabel) {
    return `${sectionLabel} - ${yearLabel}`
  }
  return sectionLabel ?? yearLabel ?? null
}

// What an open lesson (no subject picked yet) is called in messages.
const OPEN_SUBJECT_LABEL = 'Materia a scelta'

async function fetchLessonEmailDetails(lessonId: string, tutorId: string, subjectId: string | null) {
  const [tutor, subject] = await Promise.all([
    db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, tutorId)
      },
      columns: { firstName: true, lastName: true, email: true }
    }),
    subjectId
      ? db.query.subjects.findFirst({
          where(fields, operators) {
            return operators.eq(fields.id, subjectId)
          },
          columns: { name: true }
        })
      : Promise.resolve({ name: OPEN_SUBJECT_LABEL })
  ])

  if (!tutor || !subject) {
    return null
  }

  return {
    lessonId,
    subjectName: subject.name,
    tutorName: `${tutor.firstName} ${tutor.lastName}`,
    tutorEmail: tutor.email
  }
}

async function fetchStudentsDetails(studentIds: string[]) {
  if (studentIds.length === 0) {
    return new Map<string, { name: string, email: string | null, classLabel: string | null }>()
  }

  const uniqueIds = Array.from(new Set(studentIds))
  const [students, profiles] = await Promise.all([
    db.query.users.findMany({
      where(fields, operators) {
        return operators.inArray(fields.id, uniqueIds)
      },
      columns: { id: true, firstName: true, lastName: true, email: true }
    }),
    db.query.studentProfiles.findMany({
      where(fields, operators) {
        return operators.inArray(fields.userId, uniqueIds)
      },
      columns: { userId: true, sectionId: true, year: true }
    })
  ])

  const sectionIds = Array.from(new Set(profiles.map(profile => profile.sectionId).filter(Boolean))) as string[]
  const sections = sectionIds.length > 0
    ? await db.query.classSections.findMany({
        where(fields, operators) {
          return operators.inArray(fields.id, sectionIds)
        },
        columns: { id: true, name: true }
      })
    : []

  const sectionNameMap = new Map(sections.map(section => [section.id, section.name]))
  const profileMap = new Map(profiles.map(profile => [profile.userId, profile]))

  return new Map(students.map((student) => {
    const profile = profileMap.get(student.id)
    const sectionName = profile?.sectionId ? sectionNameMap.get(profile.sectionId) ?? null : null
    const classLabel = buildClassLabel(sectionName, profile?.sectionId ?? null, profile?.year ?? null)
    return [
      student.id,
      {
        name: `${student.firstName} ${student.lastName}`,
        email: student.email ?? null,
        classLabel
      }
    ]
  }))
}

// True once `now` is on the lesson's school day or later.
function sameDayOrAfter(now: Date, lessonStart: Date) {
  return schoolDayKey(now) >= schoolDayKey(lessonStart)
}

function rejection<S extends number>(message: string, status: S, reason?: BookingOutcome) {
  return { rejected: true as const, message, status, reason }
}

async function getTutorDailyCapacity(tutorId: string, executor: DbExecutor = db): Promise<number> {
  const settings = await executor.query.tutorSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: { dailyCapacity: true }
  })
  return settings?.dailyCapacity ?? 1
}

async function cancelConfirmedBookings(tx: DbTransaction, lessonId: string, adminId: string) {
  const bookings = await tx.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lessonId),
        operators.eq(fields.status, 'confirmed')
      )
    }
  })

  for (const booking of bookings) {
    await tx.update(lessonBookings)
      .set({
        status: 'canceled',
        canceledAt: new Date(),
        canceledBy: adminId,
        studentPresence: null,
        studentPresenceAt: null,
        countsForStudent: false
      })
      .where(eq(lessonBookings.id, booking.id))

    await tx.insert(tokenLedger).values({
      studentId: booking.studentId,
      lessonId,
      delta: 1,
      reason: 'lesson_cancel_admin'
    })
  }
}

async function getTutorDailyBookingCount(tutorId: string, date: Date, executor: DbExecutor = db): Promise<number> {
  const day = schoolDayRange(date)

  const tutorLessons = await executor.query.lessons.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.gte(fields.startAt, day.start),
        operators.lt(fields.startAt, day.end)
      )
    },
    columns: { id: true }
  })

  if (tutorLessons.length === 0) {
    return 0
  }

  const lessonIds = tutorLessons.map(l => l.id)
  const bookings = await executor.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.inArray(fields.lessonId, lessonIds),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: { id: true }
  })

  return bookings.length
}

async function getStudentDailyBookingCount(studentId: string, date: Date, executor: DbExecutor = db): Promise<number> {
  const day = schoolDayRange(date)

  const [{ total }] = await executor
    .select({ total: sql<number>`count(*)::int` })
    .from(lessonBookings)
    .innerJoin(lessons, eq(lessonBookings.lessonId, lessons.id))
    .where(and(
      eq(lessonBookings.studentId, studentId),
      eq(lessonBookings.status, 'confirmed'),
      gte(lessons.startAt, day.start),
      lt(lessons.startAt, day.end)
    ))

  return total ?? 0
}

interface SubjectOption { id: string, name: string }

// The subjects each tutor teaches: what a booking may pick on an open lesson.
async function getTutorSubjectOptions(tutorIds: string[]): Promise<Map<string, SubjectOption[]>> {
  const options = new Map<string, SubjectOption[]>()
  if (tutorIds.length === 0) {
    return options
  }
  const rows = await db
    .select({ tutorId: tutorSubjects.tutorId, id: subjects.id, name: subjects.name })
    .from(tutorSubjects)
    .innerJoin(subjects, eq(tutorSubjects.subjectId, subjects.id))
    .where(inArray(tutorSubjects.tutorId, [...new Set(tutorIds)]))
    .orderBy(asc(subjects.name))
  for (const row of rows) {
    const list = options.get(row.tutorId) ?? []
    list.push({ id: row.id, name: row.name })
    options.set(row.tutorId, list)
  }
  return options
}

// A lesson matches a subject when it is for that subject, or is still open and its tutor teaches it.
function lessonOffersSubject(subjectId: string) {
  return or(
    eq(lessons.subjectId, subjectId),
    and(
      isNull(lessons.subjectId),
      inArray(
        lessons.tutorId,
        db.select({ tutorId: tutorSubjects.tutorId }).from(tutorSubjects).where(eq(tutorSubjects.subjectId, subjectId))
      )
    )
  )!
}

// The subjects a booking may pick: the open lesson's tutor's subjects, or the subject already set.
function subjectOptionsFor(lesson: { tutorId: string, subjectId: string | null, subjectName?: string | null }, tutorOptions: Map<string, SubjectOption[]>): SubjectOption[] {
  if (lesson.subjectId) {
    const name = lesson.subjectName ?? tutorOptions.get(lesson.tutorId)?.find(option => option.id === lesson.subjectId)?.name
    return name ? [{ id: lesson.subjectId, name }] : []
  }
  return tutorOptions.get(lesson.tutorId) ?? []
}

export const listLessons: AppRouteHandler<ListLessonsRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }

  const query = c.req.valid('query')

  const clauses: SQL[] = []
  if (query.tutorId) {
    clauses.push(eq(lessons.tutorId, query.tutorId))
  }
  if (query.subjectId) {
    clauses.push(lessonOffersSubject(query.subjectId))
  }
  if (query.status) {
    clauses.push(eq(lessons.status, query.status))
  }
  if (query.from) {
    clauses.push(gte(lessons.startAt, new Date(query.from)))
  }
  if (query.to) {
    clauses.push(lte(lessons.startAt, new Date(query.to)))
  }

  const orderBy = query.sortBy === 'createdAt' ? lessons.createdAt : lessons.startAt
  const direction = query.sortDir === 'desc' ? desc(orderBy) : asc(orderBy)

  const listWhere = query.q
    ? and(
        ...clauses,
        or(
          ilike(users.firstName, `%${query.q}%`),
          ilike(users.lastName, `%${query.q}%`),
          ilike(subjects.name, `%${query.q}%`),
          ilike(subjects.canonicalName, `%${query.q}%`)
        )
      )
    : clauses.length ? and(...clauses) : undefined

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(lessons)
    .innerJoin(users, eq(lessons.tutorId, users.id))
    .leftJoin(subjects, eq(lessons.subjectId, subjects.id))
    .where(listWhere)

  const pageLessons = await db
    .select({
      id: lessons.id,
      tutorId: lessons.tutorId,
      subjectId: lessons.subjectId,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      seats: lessons.seats,
      status: lessons.status,
      subjectFromBooking: lessons.subjectFromBooking,
      createdAt: lessons.createdAt,
      countsForTutor: lessons.countsForTutor
    })
    .from(lessons)
    .innerJoin(users, eq(lessons.tutorId, users.id))
    .leftJoin(subjects, eq(lessons.subjectId, subjects.id))
    .where(listWhere)
    // Lessons can start together: without the id they could repeat or vanish between pages.
    .orderBy(direction, asc(lessons.id))
    .limit(query.limit)
    .offset(query.offset)

  if (pageLessons.length === 0) {
    return c.json(buildPagedResponse([], total, query.limit, query.offset), HttpStatusCodes.OK)
  }

  // Get unique tutor+day combinations
  const tutorDayKeys = new Set<string>()
  for (const lesson of pageLessons) {
    const dateKey = schoolDayKey(new Date(lesson.startAt))
    tutorDayKeys.add(`${lesson.tutorId}:${dateKey}`)
  }

  // Get tutor capacities
  const tutorIds = [...new Set(pageLessons.map(l => l.tutorId))]
  const tutorCapacities = new Map<string, number>()
  for (const tutorId of tutorIds) {
    tutorCapacities.set(tutorId, await getTutorDailyCapacity(tutorId))
  }

  // Get daily booking counts per tutor
  const tutorDayBookings = new Map<string, number>()
  for (const key of tutorDayKeys) {
    const [tutorId, dateKey] = key.split(':')
    const count = await getTutorDailyBookingCount(tutorId, schoolTime(dateKey))
    tutorDayBookings.set(key, count)
  }

  // Get per-lesson booking counts
  const lessonIds = pageLessons.map(l => l.id)
  const bookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.inArray(fields.lessonId, lessonIds),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: { lessonId: true }
  })

  const lessonBookingCounts = new Map<string, number>()
  for (const booking of bookings) {
    lessonBookingCounts.set(booking.lessonId, (lessonBookingCounts.get(booking.lessonId) ?? 0) + 1)
  }

  const items = pageLessons.map((lesson) => {
    const dateKey = schoolDayKey(new Date(lesson.startAt))
    const tutorDayKey = `${lesson.tutorId}:${dateKey}`
    const dailyBookings = tutorDayBookings.get(tutorDayKey) ?? 0
    const dailyCapacity = tutorCapacities.get(lesson.tutorId) ?? 1
    const lessonBookings = lessonBookingCounts.get(lesson.id) ?? 0

    return {
      id: lesson.id,
      tutorId: lesson.tutorId,
      subjectId: lesson.subjectId,
      startAt: new Date(lesson.startAt).toISOString(),
      durationMinutes: lesson.durationMinutes,
      lessonCapacity: lesson.seats,
      dailyCapacity,
      dailyOccupancy: dailyBookings,
      availableSeats: Math.max(0, lesson.seats - lessonBookings),
      countsForTutor: lesson.countsForTutor ?? false,
      status: lesson.status,
      subjectFromBooking: lesson.subjectFromBooking
    }
  })

  return c.json(buildPagedResponse(items, total, query.limit, query.offset), HttpStatusCodes.OK)
}

export const listMyLessons: AppRouteHandler<ListMyLessonsRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'student') {
    forbid()
  }

  const query = c.req.valid('query')

  const conditions = [eq(lessonBookings.studentId, currentUser.id)]
  if (query.bookingStatus) {
    conditions.push(eq(lessonBookings.status, query.bookingStatus))
  }
  if (query.lessonStatus) {
    conditions.push(eq(lessons.status, query.lessonStatus))
  }
  if (query.from) {
    conditions.push(gte(lessons.startAt, new Date(query.from)))
  }
  if (query.to) {
    conditions.push(lte(lessons.startAt, new Date(query.to)))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  const direction = query.sortDir === 'desc' ? desc(lessons.startAt) : asc(lessons.startAt)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(lessonBookings)
    .innerJoin(lessons, eq(lessonBookings.lessonId, lessons.id))
    .where(whereClause)

  const rows = await db
    .select({
      lessonId: lessons.id,
      tutorId: lessons.tutorId,
      tutorFirstName: users.firstName,
      tutorLastName: users.lastName,
      tutorEmail: users.email,
      subjectId: lessonBookings.subjectId,
      subjectName: subjects.name,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      lessonStatus: lessons.status,
      bookingId: lessonBookings.id,
      bookingStatus: lessonBookings.status,
      topic: lessonBookings.topic,
      countsForStudent: lessonBookings.countsForStudent,
      studentPresence: lessonBookings.studentPresence,
      studentPresenceAt: lessonBookings.studentPresenceAt
    })
    .from(lessonBookings)
    .innerJoin(lessons, eq(lessonBookings.lessonId, lessons.id))
    .innerJoin(users, eq(lessons.tutorId, users.id))
    // A booking keeps the subject the student picked, even once the lesson's own subject opens again.
    .innerJoin(subjects, eq(lessonBookings.subjectId, subjects.id))
    .where(whereClause)
    .orderBy(direction)
    .limit(query.limit)
    .offset(query.offset)

  const items = rows.map(row => ({
    id: row.lessonId,
    tutorId: row.tutorId,
    tutorFirstName: row.tutorFirstName,
    tutorLastName: row.tutorLastName,
    tutorEmail: row.tutorEmail,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    startAt: row.startAt.toISOString(),
    durationMinutes: row.durationMinutes,
    lessonStatus: row.lessonStatus,
    bookingId: row.bookingId,
    bookingStatus: row.bookingStatus,
    topic: row.topic,
    countsForStudent: row.countsForStudent,
    studentPresence: row.studentPresence,
    studentPresenceAt: row.studentPresenceAt ? row.studentPresenceAt.toISOString() : null
  }))

  return c.json(
    buildPagedResponse(items, Number(total ?? 0), query.limit, query.offset),
    HttpStatusCodes.OK
  )
}

export const listAvailableLessons: AppRouteHandler<ListAvailableLessonsRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'student') {
    forbid()
  }

  const query = c.req.valid('query')
  const now = new Date()
  const tomorrow = schoolTime(addDays(schoolDayKey(now), 1))

  const studentProfile = await db.query.studentProfiles.findFirst({
    where(fields, operators) {
      return operators.eq(fields.userId, currentUser.id)
    },
    columns: { isActive: true, year: true }
  })

  const conditions = [
    gte(lessons.startAt, tomorrow),
    or(eq(lessons.status, 'scheduled'), eq(lessons.status, 'confirmed'))
  ]
  // Same rule as tutorCanTeachStudent, which bookGeneratedLesson enforces.
  if (studentProfile?.year != null) {
    conditions.push(inArray(
      lessons.tutorId,
      db.select({ userId: tutorProfiles.userId })
        .from(tutorProfiles)
        .where(gt(tutorProfiles.year, studentProfile.year))
    ))
  }
  if (query.subjectId) {
    conditions.push(lessonOffersSubject(query.subjectId))
  }
  if (query.from) {
    conditions.push(gte(lessons.startAt, new Date(query.from)))
  }
  if (query.to) {
    conditions.push(lte(lessons.startAt, new Date(query.to)))
  }

  const listWhere = and(...conditions)

  const direction = query.sortDir === 'desc' ? desc(lessons.startAt) : asc(lessons.startAt)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(lessons)
    .where(listWhere)

  const prioritizeCanBook = query.offset === 0

  const lessonRowsQuery = db
    .select({
      id: lessons.id,
      tutorId: lessons.tutorId,
      tutorFirstName: users.firstName,
      tutorLastName: users.lastName,
      subjectId: lessons.subjectId,
      subjectName: subjects.name,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      seats: lessons.seats,
      status: lessons.status
    })
    .from(lessons)
    .innerJoin(users, eq(lessons.tutorId, users.id))
    .leftJoin(subjects, eq(lessons.subjectId, subjects.id))
    .where(listWhere)
    // Lessons can start together: without the id they could repeat or vanish between pages.
    .orderBy(direction, asc(lessons.id))

  const lessonRows = prioritizeCanBook
    ? await lessonRowsQuery
    : await lessonRowsQuery.limit(query.limit).offset(query.offset)

  if (lessonRows.length === 0) {
    return c.json(buildPagedResponse([], Number(total ?? 0), query.limit, query.offset), HttpStatusCodes.OK)
  }

  const lessonIds = lessonRows.map(row => row.id)
  const lessonDates = lessonRows.map(row => new Date(row.startAt))
  const minDate = schoolDayRange(new Date(Math.min(...lessonDates.map(date => date.getTime())))).start
  const maxDate = schoolDayRange(new Date(Math.max(...lessonDates.map(date => date.getTime())))).end

  const tokenBalance = await getStudentTokenBalance(currentUser.id)

  const studentActive = studentProfile?.isActive === true
  const hasTokens = tokenBalance > 0

  const existingBookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.inArray(fields.lessonId, lessonIds),
        operators.eq(fields.studentId, currentUser.id),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: { lessonId: true }
  })
  const bookedLessonIds = new Set(existingBookings.map(row => row.lessonId))

  const studentDayBookings = await db
    .select({ startAt: lessons.startAt })
    .from(lessonBookings)
    .innerJoin(lessons, eq(lessonBookings.lessonId, lessons.id))
    .where(and(
      eq(lessonBookings.studentId, currentUser.id),
      eq(lessonBookings.status, 'confirmed'),
      gte(lessons.startAt, minDate),
      lt(lessons.startAt, maxDate)
    ))

  const bookedDateKeys = new Set(studentDayBookings.map(row => schoolDayKey(new Date(row.startAt))))

  const bookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.inArray(fields.lessonId, lessonIds),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: { lessonId: true }
  })

  const lessonBookingCounts = new Map<string, number>()
  for (const booking of bookings) {
    lessonBookingCounts.set(booking.lessonId, (lessonBookingCounts.get(booking.lessonId) ?? 0) + 1)
  }

  const tutorIds = [...new Set(lessonRows.map(row => row.tutorId))]
  const tutorCapacities = new Map<string, number>()
  for (const tutorId of tutorIds) {
    tutorCapacities.set(tutorId, await getTutorDailyCapacity(tutorId))
  }
  const tutorOptions = await getTutorSubjectOptions(tutorIds)

  const tutorDayKeys = new Set<string>()
  for (const lesson of lessonRows) {
    const dateKey = schoolDayKey(new Date(lesson.startAt))
    tutorDayKeys.add(`${lesson.tutorId}:${dateKey}`)
  }

  const tutorDayBookings = new Map<string, number>()
  for (const key of tutorDayKeys) {
    const [tutorId, dateKey] = key.split(':')
    const count = await getTutorDailyBookingCount(tutorId, schoolTime(dateKey))
    tutorDayBookings.set(key, count)
  }

  const items = lessonRows.map((lesson) => {
    const dateKey = schoolDayKey(new Date(lesson.startAt))
    const tutorDayKey = `${lesson.tutorId}:${dateKey}`
    const dailyCapacity = tutorCapacities.get(lesson.tutorId) ?? 1
    const dailyBookings = tutorDayBookings.get(tutorDayKey) ?? 0
    const lessonBookings = lessonBookingCounts.get(lesson.id) ?? 0
    const availableSeats = Math.max(0, lesson.seats - lessonBookings)

    const cutoff = bookingCutoff(new Date(lesson.startAt))

    const canBook = studentActive
      && hasTokens
      && (lesson.status === 'scheduled' || lesson.status === 'confirmed')
      && !sameDayOrAfter(now, new Date(lesson.startAt))
      && now < cutoff
      && !bookedLessonIds.has(lesson.id)
      && !bookedDateKeys.has(dateKey)
      && dailyBookings < dailyCapacity
      && lessonBookings < lesson.seats
    const subjectOptions = subjectOptionsFor(lesson, tutorOptions)

    return {
      id: lesson.id,
      tutorId: lesson.tutorId,
      tutorFirstName: lesson.tutorFirstName,
      tutorLastName: lesson.tutorLastName,
      subjectId: lesson.subjectId,
      subjectName: lesson.subjectName,
      startAt: new Date(lesson.startAt).toISOString(),
      durationMinutes: lesson.durationMinutes,
      lessonCapacity: lesson.seats,
      dailyCapacity,
      dailyOccupancy: dailyBookings,
      availableSeats,
      status: lesson.status,
      subjectOptions,
      canBook: canBook && subjectOptions.length > 0
    }
  })

  const pagedItems = prioritizeCanBook
    ? [
        ...items.filter(item => item.canBook),
        ...items.filter(item => !item.canBook)
      ].slice(0, query.limit)
    : items

  return c.json(
    buildPagedResponse(pagedItems, Number(total ?? 0), query.limit, query.offset),
    HttpStatusCodes.OK
  )
}

export const getLesson: AppRouteHandler<GetLessonRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    },
    columns: {
      id: true,
      tutorId: true,
      subjectId: true,
      startAt: true,
      durationMinutes: true,
      seats: true,
      status: true,
      subjectFromBooking: true,
      countsForTutor: true
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const tutorOptions = await getTutorSubjectOptions([lesson.tutorId])
  const bookingCount = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lesson.id),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: { id: true }
  })

  const dailyCapacity = await getTutorDailyCapacity(lesson.tutorId)
  const dailyBookings = await getTutorDailyBookingCount(lesson.tutorId, new Date(lesson.startAt))
  const availableSeats = Math.max(0, lesson.seats - bookingCount.length)

  return c.json(
    {
      id: lesson.id,
      tutorId: lesson.tutorId,
      subjectId: lesson.subjectId,
      startAt: new Date(lesson.startAt).toISOString(),
      durationMinutes: lesson.durationMinutes,
      status: lesson.status,
      lessonCapacity: lesson.seats,
      dailyCapacity,
      dailyOccupancy: dailyBookings,
      availableSeats,
      countsForTutor: lesson.countsForTutor ?? false,
      subjectFromBooking: lesson.subjectFromBooking,
      subjectOptions: subjectOptionsFor(lesson, tutorOptions)
    },
    HttpStatusCodes.OK
  )
}

export const listLessonBookings: AppRouteHandler<ListLessonBookingsRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const currentUser = c.get('currentUser')

  if (!currentUser) {
    forbid()
  }

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    },
    columns: { id: true, tutorId: true }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const isAdmin = currentUser.role === 'admin' && currentUser.isActive === true
  const isTutor = currentUser.role === 'tutor' && currentUser.id === lesson.tutorId
  const isStudent = currentUser.role === 'student'

  if (!isAdmin && !isTutor && !isStudent) {
    forbid()
  }

  const conditions = [eq(lessonBookings.lessonId, lessonId)]
  if (isStudent) {
    conditions.push(eq(lessonBookings.studentId, currentUser.id))
  }

  const rows = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(...conditions)
    },
    columns: {
      id: true,
      lessonId: true,
      studentId: true,
      subjectId: true,
      topic: true,
      status: true,
      countsForStudent: true,
      studentPresence: true,
      studentPresenceAt: true
    }
  })

  const data = rows.map(row => ({
    ...row,
    studentPresenceAt: row.studentPresenceAt ? row.studentPresenceAt.toISOString() : null
  }))

  return c.json(buildPagedResponse(data, data.length, data.length, 0), HttpStatusCodes.OK)
}

export const bookGeneratedLesson: AppRouteHandler<BookGeneratedLessonRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }
  if (currentUser.role === 'admin' && currentUser.isActive !== true) {
    forbid()
  }

  const isAdmin = currentUser.role === 'admin'
  const studentId = isAdmin ? payload.studentId : currentUser.id
  if (!studentId) {
    return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
  }

  const studentUser = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, studentId),
        operators.eq(fields.role, 'student')
      )
    },
    columns: { id: true, email: true, firstName: true, lastName: true }
  })

  if (!studentUser) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const lessonOwner = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    },
    columns: { tutorId: true }
  })

  if (!lessonOwner) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  // Only students booking for themselves: an admin booking for someone is not usage.
  const countOutcome = (outcome: BookingOutcome) => {
    if (!isAdmin && !c.get('impersonation')) {
      countInBackground(currentUser, 'booking', outcome)
    }
  }

  if (!isAdmin && containsProfanity(payload.topic)) {
    countOutcome('profanity')
    return c.json(buildErrorResponse(HttpStatusPhrases.PROFANITY_DETECTED), HttpStatusCodes.BAD_REQUEST)
  }

  // Student balance/daily limit and tutor capacity are checked and written under the same locks.
  const outcome = await db.transaction(async (tx) => {
    await lockUsers(tx, [studentUser.id, lessonOwner.tutorId])

    const [lesson] = await tx.select().from(lessons).where(eq(lessons.id, lessonId)).for('update')

    if (!lesson) {
      return rejection(HttpStatusPhrases.NOT_FOUND, HttpStatusCodes.NOT_FOUND, 'not_found')
    }

    if (!isAdmin) {
      // The first booking turns a lesson 'confirmed'; remaining seats stay bookable.
      if (lesson.status !== 'scheduled' && lesson.status !== 'confirmed') {
        return rejection(HttpStatusPhrases.BAD_REQUEST, HttpStatusCodes.BAD_REQUEST, 'closed')
      }

      const lessonStart = new Date(lesson.startAt)
      if (sameDayOrAfter(new Date(), lessonStart)) {
        return rejection(HttpStatusPhrases.BAD_REQUEST, HttpStatusCodes.BAD_REQUEST, 'too_late')
      }

      if (new Date() >= bookingCutoff(lessonStart)) {
        return rejection(HttpStatusPhrases.BAD_REQUEST, HttpStatusCodes.BAD_REQUEST, 'too_late')
      }
    }

    const studentProfile = await tx.query.studentProfiles.findFirst({
      where(fields, operators) {
        return operators.eq(fields.userId, studentUser.id)
      },
      columns: {
        isActive: true,
        year: true
      }
    })

    if (!studentProfile?.isActive) {
      return rejection(HttpStatusPhrases.FORBIDDEN, HttpStatusCodes.FORBIDDEN, 'student_inactive')
    }

    if (!isAdmin) {
      const tutorProfile = await tx.query.tutorProfiles.findFirst({
        where(fields, operators) {
          return operators.eq(fields.userId, lesson.tutorId)
        },
        columns: { year: true }
      })
      if (!tutorProfile || !tutorCanTeachStudent(tutorProfile.year, studentProfile.year)) {
        return rejection(HttpStatusPhrases.TUTOR_YEAR_NOT_HIGHER, HttpStatusCodes.FORBIDDEN, 'tutor_year')
      }

      const tokenBalance = await getStudentTokenBalance(studentUser.id, tx)
      if (tokenBalance <= 0) {
        return rejection(HttpStatusPhrases.FORBIDDEN, HttpStatusCodes.FORBIDDEN, 'no_tokens')
      }
    }

    // Admins may override capacity, but a student can hold only one active booking per lesson.
    const existingBooking = await tx.query.lessonBookings.findFirst({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.lessonId, lesson.id),
          operators.eq(fields.studentId, studentUser.id),
          operators.eq(fields.status, 'confirmed')
        )
      },
      columns: { id: true }
    })

    if (existingBooking) {
      return rejection(HttpStatusPhrases.CONFLICT, HttpStatusCodes.CONFLICT, 'already_booked')
    }

    // An open lesson takes the subject of its first booking; later bookings must share it.
    let subjectId = lesson.subjectId
    if (!subjectId) {
      if (!payload.subjectId) {
        return rejection(HttpStatusPhrases.LESSON_SUBJECT_REQUIRED, HttpStatusCodes.BAD_REQUEST, 'subject_invalid')
      }
      const taught = await tx.query.tutorSubjects.findFirst({
        where(fields, operators) {
          return operators.and(
            operators.eq(fields.tutorId, lesson.tutorId),
            operators.eq(fields.subjectId, payload.subjectId!)
          )
        },
        columns: { id: true }
      })
      if (!taught) {
        return rejection(HttpStatusPhrases.LESSON_SUBJECT_REQUIRED, HttpStatusCodes.BAD_REQUEST, 'subject_invalid')
      }
      subjectId = payload.subjectId
    }
    else if (payload.subjectId && payload.subjectId !== subjectId) {
      return rejection(HttpStatusPhrases.LESSON_SUBJECT_TAKEN, HttpStatusCodes.CONFLICT, 'subject_taken')
    }

    if (!isAdmin) {
      const studentDailyBookings = await getStudentDailyBookingCount(studentUser.id, new Date(lesson.startAt), tx)
      if (studentDailyBookings >= 1) {
        return rejection(HttpStatusPhrases.STUDENT_DAILY_BOOKING_LIMIT, HttpStatusCodes.CONFLICT, 'daily_limit')
      }
    }

    const dailyCapacity = await getTutorDailyCapacity(lesson.tutorId, tx)
    const dailyBookings = await getTutorDailyBookingCount(lesson.tutorId, new Date(lesson.startAt), tx)

    const bookingCount = await tx.query.lessonBookings.findMany({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.lessonId, lesson.id),
          operators.eq(fields.status, 'confirmed')
        )
      },
      columns: { id: true }
    })

    if (!isAdmin) {
      if (dailyBookings >= dailyCapacity) {
        return rejection(HttpStatusPhrases.CONFLICT, HttpStatusCodes.CONFLICT, 'tutor_full')
      }

      if (bookingCount.length >= lesson.seats) {
        return rejection(HttpStatusPhrases.CONFLICT, HttpStatusCodes.CONFLICT, 'lesson_full')
      }
    }

    const [booking] = await tx.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: studentUser.id,
      subjectId,
      topic: payload.topic,
      status: 'confirmed',
      countsForStudent: true
    }).returning({
      id: lessonBookings.id,
      lessonId: lessonBookings.lessonId,
      studentId: lessonBookings.studentId,
      subjectId: lessonBookings.subjectId,
      topic: lessonBookings.topic,
      status: lessonBookings.status,
      countsForStudent: lessonBookings.countsForStudent,
      studentPresence: lessonBookings.studentPresence,
      studentPresenceAt: lessonBookings.studentPresenceAt
    })

    await tx.insert(tokenLedger).values({
      studentId: studentUser.id,
      lessonId: lesson.id,
      delta: -1,
      reason: 'lesson_booking'
    })

    if (lesson.status === 'scheduled' || lesson.subjectId !== subjectId) {
      await tx.update(lessons)
        .set({ status: lesson.status === 'scheduled' ? 'confirmed' : lesson.status, subjectId })
        .where(eq(lessons.id, lesson.id))
    }

    return { rejected: false as const, lesson: { ...lesson, subjectId }, booking, dailyCapacity, dailyBookings, confirmedCount: bookingCount.length }
  })

  if (outcome.rejected) {
    if (outcome.reason) {
      countOutcome(outcome.reason)
    }
    return c.json(buildErrorResponse(outcome.message), outcome.status)
  }
  countOutcome('ok')

  const { lesson, booking, dailyCapacity, dailyBookings, confirmedCount } = outcome

  const lessonDetails = await fetchLessonEmailDetails(lesson.id, lesson.tutorId, booking.subjectId)
  const studentsMap = await fetchStudentsDetails([studentUser.id])
  const studentDetails = studentsMap.get(studentUser.id)
  if (lessonDetails && studentDetails) {
    const studentMessage = buildLessonBookingConfirmedMessage({
      recipientRole: 'student',
      lessonStartAt: new Date(lesson.startAt),
      subjectName: lessonDetails.subjectName,
      topic: booking.topic,
      tutorName: lessonDetails.tutorName,
      studentName: studentDetails.name,
      studentClass: studentDetails.classLabel,
      bookedByAdmin: isAdmin
    })
    if (studentDetails.email) {
      sendMail({
        to: studentDetails.email,
        subject: studentMessage.subject,
        text: studentMessage.text,
        html: studentMessage.html
      }).catch(err => console.error('Failed to send booking confirmation email:', err))
    }

    if (lessonDetails.tutorEmail) {
      const tutorMessage = buildLessonBookingConfirmedMessage({
        recipientRole: 'tutor',
        lessonStartAt: new Date(lesson.startAt),
        subjectName: lessonDetails.subjectName,
        topic: booking.topic,
        tutorName: lessonDetails.tutorName,
        studentName: studentDetails.name,
        studentClass: studentDetails.classLabel,
        bookedByAdmin: isAdmin
      })
      sendMail({
        to: lessonDetails.tutorEmail,
        subject: tutorMessage.subject,
        text: tutorMessage.text,
        html: tutorMessage.html
      }).catch(err => console.error('Failed to send tutor booking email:', err))
    }
  }

  const bookedLesson = { lessonId: lesson.id, subjectName: lessonDetails?.subjectName ?? 'Lezione', startAt: new Date(lesson.startAt) }
  notifyUsers([studentUser.id], 'bookings', bookingConfirmedPush('student', bookedLesson))
  notifyUsers([lesson.tutorId], 'bookings', bookingConfirmedPush('tutor', bookedLesson))

  const updatedConfirmedCount = confirmedCount + 1
  const updatedDailyBookings = dailyBookings + 1
  const availableSeats = Math.max(0, Math.min(
    lesson.seats - updatedConfirmedCount,
    dailyCapacity - updatedDailyBookings
  ))

  return c.json(
    {
      lesson: {
        id: lesson.id,
        tutorId: lesson.tutorId,
        subjectId: lesson.subjectId,
        startAt: new Date(lesson.startAt).toISOString(),
        durationMinutes: lesson.durationMinutes,
        lessonCapacity: lesson.seats,
        dailyCapacity,
        dailyOccupancy: updatedDailyBookings,
        availableSeats,
        countsForTutor: lesson.countsForTutor ?? false,
        status: lesson.status === 'scheduled' ? 'confirmed' : lesson.status,
        subjectFromBooking: lesson.subjectFromBooking
      },
      booking: {
        ...booking,
        studentPresenceAt: booking.studentPresenceAt ? booking.studentPresenceAt.toISOString() : null
      }
    },
    HttpStatusCodes.CREATED
  )
}

export const cancelBooking: AppRouteHandler<CancelBookingRoute> = async (c) => {
  const { lessonId, bookingId } = c.req.valid('param')
  const payload = c.req.valid('json') ?? {}
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }
  if (currentUser.role === 'admin' && currentUser.isActive !== true) {
    forbid()
  }

  const booking = await db.query.lessonBookings.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, bookingId),
        operators.eq(fields.lessonId, lessonId)
      )
    }
  })

  if (!booking) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (currentUser.role !== 'admin' && booking.studentId !== currentUser.id) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  if (booking.status !== 'confirmed') {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (currentUser.role === 'student') {
    if (booking.studentPresence !== null) {
      return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
    }
    if (new Date() >= new Date(lesson.startAt)) {
      return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
    }
  }

  const now = new Date()
  const lessonStart = new Date(lesson.startAt)
  const cutoff = bookingCutoff(lessonStart)
  const lessonDayCutoff = schoolTime(schoolDayKey(lessonStart), 8)
  const lateSameDayCancel = currentUser.role === 'student'
    && isSameSchoolDay(now, lessonStart)
    && now >= lessonDayCutoff

  let countsForStudent = false
  if (currentUser.role === 'admin') {
    countsForStudent = payload?.countsForStudent ?? false
  }
  else {
    countsForStudent = now >= cutoff
  }

  const shouldRefund = !countsForStudent

  // Locks make a repeated cancellation fail instead of refunding the token twice.
  const canceled = await db.transaction(async (tx) => {
    await lockUsers(tx, [booking.studentId, lesson.tutorId])

    const [lockedBooking] = await tx.select({ status: lessonBookings.status })
      .from(lessonBookings)
      .where(eq(lessonBookings.id, bookingId))
      .for('update')

    if (lockedBooking?.status !== 'confirmed') {
      return false
    }

    await tx.update(lessonBookings)
      .set({
        status: 'canceled',
        canceledAt: new Date(),
        canceledBy: currentUser.id,
        studentPresence: null,
        studentPresenceAt: null,
        countsForStudent
      })
      .where(eq(lessonBookings.id, bookingId))

    const remaining = await tx.query.lessonBookings.findMany({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.lessonId, lesson.id),
          operators.eq(fields.status, 'confirmed')
        )
      },
      columns: { id: true }
    })

    if (remaining.length === 0) {
      await tx.update(lessons)
        .set({ status: 'scheduled' })
        .where(and(eq(lessons.id, lesson.id), eq(lessons.status, 'confirmed')))
      // Nobody holds a seat: a lesson whose subject came from bookings is open for any subject again.
      await tx.update(lessons)
        .set({ subjectId: null })
        .where(and(eq(lessons.id, lesson.id), eq(lessons.subjectFromBooking, true), eq(lessons.status, 'scheduled')))
    }

    if (shouldRefund) {
      await tx.insert(tokenLedger).values({
        studentId: booking.studentId,
        lessonId: lesson.id,
        delta: 1,
        reason: 'lesson_cancel_student'
      })
    }

    return true
  })

  if (!canceled) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const lessonDetails = await fetchLessonEmailDetails(lesson.id, lesson.tutorId, booking.subjectId)
  const studentsMap = await fetchStudentsDetails([booking.studentId])
  const studentDetails = studentsMap.get(booking.studentId)
  if (lessonDetails && studentDetails) {
    const canceledBy = currentUser.role === 'admin' ? 'admin' : 'student'
    if (studentDetails.email) {
      const studentMessage = buildLessonBookingCanceledMessage({
        recipientRole: 'student',
        canceledBy,
        lessonStartAt: new Date(lesson.startAt),
        subjectName: lessonDetails.subjectName,
        topic: booking.topic,
        noRefundNotice: currentUser.role === 'student' && countsForStudent,
        tutorName: lessonDetails.tutorName,
        studentName: studentDetails.name,
        studentClass: studentDetails.classLabel
      })
      sendMail({
        to: studentDetails.email,
        subject: studentMessage.subject,
        text: studentMessage.text,
        html: studentMessage.html
      }).catch(err => console.error('Failed to send cancel booking email:', err))
    }

    if (lessonDetails.tutorEmail) {
      const tutorMessage = buildLessonBookingCanceledMessage({
        recipientRole: 'tutor',
        canceledBy,
        lessonStartAt: new Date(lesson.startAt),
        subjectName: lessonDetails.subjectName,
        topic: booking.topic,
        tutorPartialNotice: lateSameDayCancel,
        tutorName: lessonDetails.tutorName,
        studentName: studentDetails.name,
        studentClass: studentDetails.classLabel
      })
      sendMail({
        to: lessonDetails.tutorEmail,
        subject: tutorMessage.subject,
        text: tutorMessage.text,
        html: tutorMessage.html
      }).catch(err => console.error('Failed to send tutor cancel booking email:', err))
    }
  }

  const canceledBooking = { lessonId: lesson.id, subjectName: lessonDetails?.subjectName ?? 'Lezione', startAt: new Date(lesson.startAt) }
  notifyUsers([booking.studentId], 'bookings', bookingCanceledPush('student', canceledBooking))
  if (lateSameDayCancel) {
    notifyLateCancellation({ lessonId: lesson.id, studentId: booking.studentId })
  }
  notifyUsers([lesson.tutorId], 'bookings', bookingCanceledPush('tutor', canceledBooking))

  const updated = await db.query.lessonBookings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, bookingId)
    },
    columns: {
      id: true,
      lessonId: true,
      studentId: true,
      subjectId: true,
      topic: true,
      status: true,
      countsForStudent: true,
      studentPresence: true,
      studentPresenceAt: true
    }
  })

  return c.json(
    {
      ...updated!,
      studentPresenceAt: updated?.studentPresenceAt ? updated.studentPresenceAt.toISOString() : null
    },
    HttpStatusCodes.OK
  )
}

export const cancelLesson: AppRouteHandler<CancelLessonRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json') ?? {}
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }

  const isAdmin = currentUser.role === 'admin' && currentUser.isActive === true
  const isTutor = currentUser.role === 'tutor'

  if (!isAdmin && !isTutor) {
    forbid()
  }

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (isTutor && lesson.tutorId !== currentUser.id) {
    forbid()
  }

  const countsForTutor = isAdmin ? (payload?.countsForTutor ?? false) : false

  // The tutor lock serializes this with new bookings, so none can slip in unrefunded.
  const confirmedBookings = await db.transaction(async (tx) => {
    await lockUsers(tx, [lesson.tutorId])

    const bookings = await tx.query.lessonBookings.findMany({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.lessonId, lesson.id),
          operators.eq(fields.status, 'confirmed')
        )
      },
      columns: { studentId: true, subjectId: true, topic: true }
    })

    if (isTutor && bookings.length > 0) {
      return null
    }

    await tx.update(lessons)
      .set({ status: 'canceled', countsForTutor })
      .where(eq(lessons.id, lessonId))

    if (isAdmin) {
      await cancelConfirmedBookings(tx, lessonId, currentUser.id)
    }

    return bookings
  })

  if (!confirmedBookings) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  let confirmedStudentIds: string[] = []
  const topicsByStudentId = new Map<string, string | null>()
  let confirmedTopics: string[] = []
  if (isAdmin) {
    confirmedStudentIds = confirmedBookings.map(booking => booking.studentId)
    confirmedTopics = confirmedBookings
      .map(booking => booking.topic?.trim())
      .filter((topic): topic is string => Boolean(topic))
    for (const booking of confirmedBookings) {
      topicsByStudentId.set(booking.studentId, booking.topic ?? null)
    }
  }

  if (isAdmin && confirmedStudentIds.length > 0) {
    const lessonDetails = await fetchLessonEmailDetails(lesson.id, lesson.tutorId, lesson.subjectId ?? confirmedBookings[0].subjectId)
    const studentsMap = await fetchStudentsDetails(confirmedStudentIds)
    if (lessonDetails) {
      for (const studentId of confirmedStudentIds) {
        const studentDetails = studentsMap.get(studentId)
        if (!studentDetails?.email) {
          continue
        }
        const studentMessage = buildLessonCanceledMessage({
          recipientRole: 'student',
          canceledBy: 'admin',
          lessonStartAt: new Date(lesson.startAt),
          subjectName: lessonDetails.subjectName,
          topic: topicsByStudentId.get(studentId) ?? null,
          tutorName: lessonDetails.tutorName,
          students: [{ name: studentDetails.name, classLabel: studentDetails.classLabel }]
        })
        sendMail({
          to: studentDetails.email,
          subject: studentMessage.subject,
          text: studentMessage.text,
          html: studentMessage.html
        }).catch(err => console.error('Failed to send lesson canceled email:', err))
      }

      if (lessonDetails.tutorEmail) {
        const studentList = confirmedStudentIds
          .map((id) => {
            const student = studentsMap.get(id)
            return student ? { name: student.name, classLabel: student.classLabel } : null
          })
          .filter((student): student is { name: string, classLabel: string | null } => Boolean(student))
        const tutorMessage = buildLessonCanceledMessage({
          recipientRole: 'tutor',
          canceledBy: 'admin',
          lessonStartAt: new Date(lesson.startAt),
          subjectName: lessonDetails.subjectName,
          topics: Array.from(new Set(confirmedTopics)),
          tutorName: lessonDetails.tutorName,
          students: studentList
        })
        sendMail({
          to: lessonDetails.tutorEmail,
          subject: tutorMessage.subject,
          text: tutorMessage.text,
          html: tutorMessage.html
        }).catch(err => console.error('Failed to send tutor lesson canceled email:', err))
      }

      const canceledLesson = { lessonId: lesson.id, subjectName: lessonDetails.subjectName, startAt: new Date(lesson.startAt) }
      notifyUsers(confirmedStudentIds, 'bookings', lessonCanceledPush('student', canceledLesson))
      notifyUsers([lesson.tutorId], 'bookings', lessonCanceledPush('tutor', canceledLesson))
    }
  }

  return c.json({ message: 'Lezione annullata' }, HttpStatusCodes.OK)
}

export const updateLessonCounts: AppRouteHandler<UpdateLessonCountsRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json')
  ensureAdmin(c)

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const [updated] = await db.update(lessons)
    .set({ countsForTutor: payload.countsForTutor })
    .where(eq(lessons.id, lessonId))
    .returning({
      id: lessons.id,
      tutorId: lessons.tutorId,
      subjectId: lessons.subjectId,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      seats: lessons.seats,
      countsForTutor: lessons.countsForTutor,
      status: lessons.status,
      subjectFromBooking: lessons.subjectFromBooking
    })

  const bookingCount = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, updated.id),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: { id: true }
  })
  const dailyCapacity = await getTutorDailyCapacity(updated.tutorId)
  const dailyBookings = await getTutorDailyBookingCount(updated.tutorId, new Date(updated.startAt))
  const availableSeats = Math.max(0, updated.seats - bookingCount.length)

  return c.json(
    {
      id: updated.id,
      tutorId: updated.tutorId,
      subjectId: updated.subjectId,
      startAt: new Date(updated.startAt).toISOString(),
      durationMinutes: updated.durationMinutes,
      status: updated.status,
      subjectFromBooking: updated.subjectFromBooking,
      lessonCapacity: updated.seats,
      dailyCapacity,
      dailyOccupancy: dailyBookings,
      availableSeats,
      countsForTutor: updated.countsForTutor ?? false
    },
    HttpStatusCodes.OK
  )
}

export const setBookingPresence: AppRouteHandler<SetBookingPresenceRoute> = async (c) => {
  const { lessonId, bookingId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }

  const isAdmin = currentUser.role === 'admin' && currentUser.isActive === true
  const isTutor = currentUser.role === 'tutor'

  if (!isAdmin && !isTutor) {
    forbid()
  }

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (isTutor && lesson.tutorId !== currentUser.id) {
    forbid()
  }

  if (isTutor) {
    const lessonStartAt = new Date(lesson.startAt)
    const twoHoursAfterStart = new Date(lessonStartAt.getTime() + 2 * 60 * 60 * 1000)
    const now = new Date()
    if (now < lessonStartAt || now > twoHoursAfterStart) {
      return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
    }
  }

  const booking = await db.query.lessonBookings.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, bookingId),
        operators.eq(fields.lessonId, lessonId)
      )
    }
  })

  if (!booking) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (booking.status !== 'confirmed') {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  if (isTutor && payload.present === null) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  const presenceAt = payload.present === null ? null : new Date()
  const countsForStudent = payload.present === null ? booking.countsForStudent : true
  await db.update(lessonBookings)
    .set({
      studentPresence: payload.present ?? null,
      studentPresenceAt: presenceAt,
      countsForStudent
    })
    .where(eq(lessonBookings.id, bookingId))

  if (payload.present !== null && (isTutor || isAdmin) && !lesson.countsForTutor) {
    await db.update(lessons)
      .set({ countsForTutor: true })
      .where(eq(lessons.id, lesson.id))
  }

  // Each absence once: marking an absent student absent again is not a new one.
  if (payload.present === false && booking.studentPresence !== false) {
    notifyAbsence({ lessonId: lesson.id, studentId: booking.studentId })
  }

  if (payload.present !== null) {
    const lessonDetails = await fetchLessonEmailDetails(lesson.id, lesson.tutorId, booking.subjectId)
    const studentsMap = await fetchStudentsDetails([booking.studentId])
    const studentDetails = studentsMap.get(booking.studentId)
    if (lessonDetails && studentDetails?.email) {
      const message = buildLessonPresenceUpdatedMessage({
        lessonStartAt: new Date(lesson.startAt),
        subjectName: lessonDetails.subjectName,
        tutorName: lessonDetails.tutorName,
        present: payload.present
      })
      void sendMail({
        to: studentDetails.email,
        subject: message.subject,
        text: message.text,
        html: message.html
      }).catch(err => console.error('Failed to send presence update email:', err))
    }
  }

  return c.json(
    {
      status: booking.status,
      studentPresence: payload.present ?? null,
      studentPresenceAt: presenceAt ? presenceAt.toISOString() : null
    },
    HttpStatusCodes.OK
  )
}

export const updateBookingTopic: AppRouteHandler<UpdateBookingTopicRoute> = async (c) => {
  const { lessonId, bookingId } = c.req.valid('param')
  const payload = c.req.valid('json')
  ensureAdmin(c)

  const booking = await db.query.lessonBookings.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, bookingId),
        operators.eq(fields.lessonId, lessonId)
      )
    }
  })

  if (!booking) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const [updated] = await db.update(lessonBookings)
    .set({ topic: payload.topic })
    .where(eq(lessonBookings.id, bookingId))
    .returning({
      id: lessonBookings.id,
      lessonId: lessonBookings.lessonId,
      studentId: lessonBookings.studentId,
      subjectId: lessonBookings.subjectId,
      topic: lessonBookings.topic,
      status: lessonBookings.status,
      countsForStudent: lessonBookings.countsForStudent,
      studentPresence: lessonBookings.studentPresence,
      studentPresenceAt: lessonBookings.studentPresenceAt
    })

  return c.json({
    ...updated,
    studentPresenceAt: updated.studentPresenceAt ? updated.studentPresenceAt.toISOString() : null
  }, HttpStatusCodes.OK)
}

export const updateBookingCounts: AppRouteHandler<UpdateBookingCountsRoute> = async (c) => {
  const { lessonId, bookingId } = c.req.valid('param')
  const payload = c.req.valid('json')
  ensureAdmin(c)

  const outcome = await db.transaction(async (tx) => {
    const [booking] = await tx.select()
      .from(lessonBookings)
      .where(and(eq(lessonBookings.id, bookingId), eq(lessonBookings.lessonId, lessonId)))
      .for('update')

    if (!booking) {
      return null
    }

    const [updated] = await tx.update(lessonBookings)
      .set({ countsForStudent: payload.countsForStudent })
      .where(eq(lessonBookings.id, bookingId))
      .returning({
        id: lessonBookings.id,
        lessonId: lessonBookings.lessonId,
        studentId: lessonBookings.studentId,
        subjectId: lessonBookings.subjectId,
        topic: lessonBookings.topic,
        status: lessonBookings.status,
        countsForStudent: lessonBookings.countsForStudent,
        studentPresence: lessonBookings.studentPresence,
        studentPresenceAt: lessonBookings.studentPresenceAt
      })

    if (booking.countsForStudent !== payload.countsForStudent) {
      await tx.insert(tokenLedger).values({
        studentId: booking.studentId,
        lessonId: booking.lessonId,
        delta: payload.countsForStudent ? -1 : 1,
        reason: 'lesson_counts_adjusted'
      })
    }

    return updated
  })

  if (!outcome) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  return c.json({
    ...outcome,
    studentPresenceAt: outcome.studentPresenceAt ? outcome.studentPresenceAt.toISOString() : null
  }, HttpStatusCodes.OK)
}

export const rescheduleLesson: AppRouteHandler<RescheduleLessonRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const admin = ensureAdmin(c)

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (lesson.status === 'canceled') {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const newStartAt = new Date(payload.startAt)
  // Without a subject the lesson keeps letting bookings choose it, starting from the one it has now.
  const subjectFromBooking = payload.subjectId === null
  const newSubjectId = payload.subjectId ?? lesson.subjectId

  const outcome = await db.transaction(async (tx) => {
    await lockUsers(tx, [lesson.tutorId, payload.tutorId])

    const [lockedLesson] = await tx.select({ status: lessons.status })
      .from(lessons)
      .where(eq(lessons.id, lesson.id))
      .for('update')

    if (!lockedLesson || lockedLesson.status === 'canceled') {
      return null
    }

    const seats = await getTutorDailyCapacity(payload.tutorId, tx)

    const [createdLesson] = await tx.insert(lessons).values({
      tutorId: payload.tutorId,
      subjectId: newSubjectId,
      subjectFromBooking,
      startAt: newStartAt,
      durationMinutes: payload.durationMinutes,
      seats,
      status: lockedLesson.status
    }).returning({
      id: lessons.id,
      countsForTutor: lessons.countsForTutor
    })

    await tx.update(lessons)
      .set({ status: 'canceled', countsForTutor: false })
      .where(eq(lessons.id, lesson.id))

    const bookings = await tx.query.lessonBookings.findMany({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.lessonId, lesson.id),
          operators.eq(fields.status, 'confirmed')
        )
      },
      columns: {
        id: true,
        studentId: true,
        subjectId: true,
        topic: true,
        countsForStudent: true,
        studentPresence: true,
        studentPresenceAt: true
      }
    })

    if (bookings.length > 0) {
      const bookingIdMap = new Map<string, string>()
      const newBookingRows = bookings.map((booking) => {
        const newId = randomUUID()
        bookingIdMap.set(booking.id, newId)
        return {
          id: newId,
          lessonId: createdLesson.id,
          studentId: booking.studentId,
          // Moved bookings follow the subject the admin set; kept open, they keep their own.
          subjectId: newSubjectId ?? booking.subjectId,
          topic: booking.topic,
          status: 'confirmed',
          countsForStudent: booking.countsForStudent,
          studentPresence: booking.studentPresence,
          studentPresenceAt: booking.studentPresenceAt
        }
      })

      await tx.insert(lessonBookings).values(newBookingRows)

      if (bookings.some(booking => booking.studentPresence !== null)) {
        await tx.update(lessons)
          .set({ countsForTutor: true })
          .where(eq(lessons.id, createdLesson.id))
      }

      for (const [oldBookingId, newBookingId] of bookingIdMap) {
        await tx.update(lessonFeedback)
          .set({
            lessonId: createdLesson.id,
            bookingId: newBookingId
          })
          .where(eq(lessonFeedback.bookingId, oldBookingId))
      }

      await tx.update(lessonBookings)
        .set({
          status: 'canceled',
          canceledAt: new Date(),
          canceledBy: admin.id,
          countsForStudent: false,
          studentPresence: null,
          studentPresenceAt: null
        })
        .where(and(
          eq(lessonBookings.lessonId, lesson.id),
          eq(lessonBookings.status, 'confirmed')
        ))
    }

    return { newLesson: createdLesson, existingBookings: bookings }
  })

  if (!outcome) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const { newLesson, existingBookings } = outcome
  const studentIds = existingBookings.map(booking => booking.studentId)
  const tutorChanged = lesson.tutorId !== payload.tutorId
  const changed = tutorChanged
    || lesson.subjectId !== newSubjectId
    || new Date(lesson.startAt).getTime() !== newStartAt.getTime()
    || lesson.durationMinutes !== payload.durationMinutes

  // A tutor who loses or gains the lesson hears about it even when nobody booked it.
  if (changed && (studentIds.length > 0 || tutorChanged)) {
    const studentsMap = await fetchStudentsDetails(studentIds)
    const oldDetails = await fetchLessonEmailDetails(lesson.id, lesson.tutorId, lesson.subjectId)
    const newDetails = await fetchLessonEmailDetails(newLesson.id, payload.tutorId, newSubjectId)

    if (oldDetails && newDetails) {
      const studentList = studentIds
        .map((id) => {
          const student = studentsMap.get(id)
          return student ? { name: student.name, classLabel: student.classLabel } : null
        })
        .filter((student): student is { name: string, classLabel: string | null } => Boolean(student))

      for (const studentId of studentIds) {
        const student = studentsMap.get(studentId)
        if (!student?.email) {
          continue
        }
        const studentMessage = buildLessonRescheduledMessage({
          recipientRole: 'student',
          oldStartAt: new Date(lesson.startAt),
          newStartAt,
          oldSubjectName: oldDetails.subjectName,
          newSubjectName: newDetails.subjectName,
          oldTutorName: oldDetails.tutorName,
          newTutorName: newDetails.tutorName,
          students: [{ name: student.name, classLabel: student.classLabel }],
          rescheduledByAdmin: true
        })
        sendMail({
          to: student.email,
          subject: studentMessage.subject,
          text: studentMessage.text,
          html: studentMessage.html
        }).catch(err => console.error('Failed to send reschedule email:', err))
      }

      if (newDetails.tutorEmail) {
        const tutorMessage = buildLessonRescheduledMessage({
          recipientRole: 'tutor',
          oldStartAt: new Date(lesson.startAt),
          newStartAt,
          oldSubjectName: oldDetails.subjectName,
          newSubjectName: newDetails.subjectName,
          oldTutorName: oldDetails.tutorName,
          newTutorName: newDetails.tutorName,
          students: studentList,
          rescheduledByAdmin: true
        })
        sendMail({
          to: newDetails.tutorEmail,
          subject: tutorMessage.subject,
          text: tutorMessage.text,
          html: tutorMessage.html
        }).catch(err => console.error('Failed to send tutor reschedule email:', err))
      }

      if (tutorChanged && oldDetails.tutorEmail) {
        const reassignedMessage = buildLessonReassignedMessage({
          lessonStartAt: new Date(lesson.startAt),
          subjectName: oldDetails.subjectName,
          tutorName: oldDetails.tutorName
        })
        sendMail({
          to: oldDetails.tutorEmail,
          subject: reassignedMessage.subject,
          text: reassignedMessage.text,
          html: reassignedMessage.html
        }).catch(err => console.error('Failed to send lesson reassigned email:', err))
      }

      const before = { lessonId: lesson.id, subjectName: oldDetails.subjectName, startAt: new Date(lesson.startAt), durationMinutes: lesson.durationMinutes }
      const after = { lessonId: newLesson.id, subjectName: newDetails.subjectName, startAt: newStartAt, durationMinutes: payload.durationMinutes }
      const studentPush = lessonChangedPush('student', before, after, tutorChanged)
      if (studentPush) {
        notifyUsers(studentIds, 'bookings', studentPush)
      }
      if (tutorChanged) {
        notifyUsers([lesson.tutorId], 'bookings', lessonReassignedPush(before))
        notifyUsers([payload.tutorId], 'bookings', lessonAssignedPush(after, studentIds.length))
      }
      else {
        const tutorPush = lessonChangedPush('tutor', before, after, false)
        if (tutorPush) {
          notifyUsers([payload.tutorId], 'bookings', tutorPush)
        }
      }
    }
  }

  return c.json(
    {
      message: 'Lezione riprogrammata',
      lessonId: newLesson.id
    },
    HttpStatusCodes.OK
  )
}

export const createLesson: AppRouteHandler<CreateLessonRoute> = async (c) => {
  const payload = c.req.valid('json')
  ensureAdmin(c)

  const newStartAt = new Date(payload.startAt)
  const dailyCapacity = await getTutorDailyCapacity(payload.tutorId)
  const seats = dailyCapacity

  const [newLesson] = await db.insert(lessons).values({
    tutorId: payload.tutorId,
    subjectId: payload.subjectId,
    startAt: newStartAt,
    durationMinutes: payload.durationMinutes,
    seats,
    status: 'scheduled'
  }).returning({
    id: lessons.id
  })

  const details = await fetchLessonEmailDetails(newLesson.id, payload.tutorId, payload.subjectId)
  if (details?.tutorEmail) {
    const message = buildLessonCreatedMessage({
      lessonId: newLesson.id,
      lessonStartAt: newStartAt,
      subjectName: details.subjectName,
      tutorName: details.tutorName
    })
    sendMail({
      to: details.tutorEmail,
      subject: message.subject,
      text: message.text,
      html: message.html
    }).catch(err => console.error('Failed to send lesson created email:', err))
  }
  if (details) {
    notifyUsers([payload.tutorId], 'lessons', lessonCreatedPush({ lessonId: newLesson.id, subjectName: details.subjectName, startAt: newStartAt }))
  }

  return c.json(
    {
      message: 'Lezione creata',
      lessonId: newLesson.id
    },
    HttpStatusCodes.CREATED
  )
}
