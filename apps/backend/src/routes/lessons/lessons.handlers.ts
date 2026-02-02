// Purpose: Lesson booking handlers enforcing availability and token rules.
import type { SQL } from 'drizzle-orm'
import type { Context } from 'hono'

import { and, asc, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { randomUUID } from 'node:crypto'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { users } from '@/db/schemas/users.schema'
import {
  buildLessonBookingCanceledMessage,
  buildLessonBookingConfirmedMessage,
  buildLessonCanceledMessage,
  buildLessonCreatedMessage,
  buildLessonRescheduledMessage
} from '@/lib/email-templates'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { getStudentTokenBalance } from '@/lib/lesson-tokens'
import { sendMail } from '@/lib/mailer'
import { buildPagedResponse } from '@/lib/pagination'

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

function getWeekStart(date: Date) {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + diff)
  return start
}

function getWeekEnd(date: Date) {
  const start = getWeekStart(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

function withinLessonWeek(lessonStart: Date, now = new Date()) {
  const start = getWeekStart(lessonStart)
  const end = getWeekEnd(lessonStart)
  return now >= start && now <= end
}

function buildClassLabel(sectionName: string | null, sectionId: string | null, year: number | null) {
  const sectionLabel = sectionName ?? sectionId
  const yearLabel = year ? `anno ${year}` : null
  if (sectionLabel && yearLabel) {
    return `${sectionLabel} - ${yearLabel}`
  }
  return sectionLabel ?? yearLabel ?? null
}

async function fetchLessonEmailDetails(lessonId: string, tutorId: string, subjectId: string) {
  const [tutor, subject] = await Promise.all([
    db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, tutorId)
      },
      columns: { firstName: true, lastName: true, email: true }
    }),
    db.query.subjects.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, subjectId)
      },
      columns: { name: true }
    })
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

function sameDayOrAfter(a: Date, b: Date) {
  const aDay = new Date(a)
  aDay.setHours(0, 0, 0, 0)
  const bDay = new Date(b)
  bDay.setHours(0, 0, 0, 0)
  return aDay.getTime() >= bDay.getTime()
}

async function getTutorDailyCapacity(tutorId: string): Promise<number> {
  const settings = await db.query.tutorSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: { dailyCapacity: true }
  })
  return settings?.dailyCapacity ?? 1
}

async function isSubjectAllowed(tutorId: string, subjectId: string) {
  const link = await db.query.tutorSubjects.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.eq(fields.subjectId, subjectId)
      )
    },
    columns: { id: true }
  })
  return Boolean(link)
}

async function cancelConfirmedBookings(lessonId: string, adminId: string) {
  const bookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lessonId),
        operators.eq(fields.status, 'confirmed')
      )
    }
  })

  for (const booking of bookings) {
    await db.update(lessonBookings)
      .set({
        status: 'canceled',
        canceledAt: new Date(),
        canceledBy: adminId,
        studentPresence: null,
        studentPresenceAt: null,
        countsForStudent: false
      })
      .where(eq(lessonBookings.id, booking.id))

    await db.insert(tokenLedger).values({
      studentId: booking.studentId,
      lessonId,
      delta: 1,
      reason: 'lesson_cancel_admin'
    })
  }
}

function getDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

async function getTutorDailyBookingCount(tutorId: string, date: Date): Promise<number> {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const tutorLessons = await db.query.lessons.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.gte(fields.startAt, dayStart),
        operators.lte(fields.startAt, dayEnd)
      )
    },
    columns: { id: true }
  })

  if (tutorLessons.length === 0) {
    return 0
  }

  const lessonIds = tutorLessons.map(l => l.id)
  const bookings = await db.query.lessonBookings.findMany({
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

async function getStudentDailyBookingCount(studentId: string, date: Date): Promise<number> {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(lessonBookings)
    .innerJoin(lessons, eq(lessonBookings.lessonId, lessons.id))
    .where(and(
      eq(lessonBookings.studentId, studentId),
      eq(lessonBookings.status, 'confirmed'),
      gte(lessons.startAt, dayStart),
      lte(lessons.startAt, dayEnd)
    ))

  return total ?? 0
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
    clauses.push(eq(lessons.subjectId, query.subjectId))
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

  const baseQuery = db
    .select({
      id: lessons.id,
      tutorId: lessons.tutorId,
      subjectId: lessons.subjectId,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      seats: lessons.seats,
      status: lessons.status,
      createdAt: lessons.createdAt,
      countsForTutor: lessons.countsForTutor
    })
    .from(lessons)
    .innerJoin(users, eq(lessons.tutorId, users.id))
    .innerJoin(subjects, eq(lessons.subjectId, subjects.id))

  const allLessons = await (listWhere ? baseQuery.where(listWhere) : baseQuery).orderBy(direction)

  if (allLessons.length === 0) {
    return c.json(buildPagedResponse([], 0, query.limit, query.offset), HttpStatusCodes.OK)
  }

  // Get unique tutor+day combinations
  const tutorDayKeys = new Set<string>()
  for (const lesson of allLessons) {
    const dateKey = getDateKey(new Date(lesson.startAt))
    tutorDayKeys.add(`${lesson.tutorId}:${dateKey}`)
  }

  // Get tutor capacities
  const tutorIds = [...new Set(allLessons.map(l => l.tutorId))]
  const tutorCapacities = new Map<string, number>()
  for (const tutorId of tutorIds) {
    tutorCapacities.set(tutorId, await getTutorDailyCapacity(tutorId))
  }

  // Get daily booking counts per tutor
  const tutorDayBookings = new Map<string, number>()
  for (const key of tutorDayKeys) {
    const [tutorId, dateKey] = key.split(':')
    const date = new Date(dateKey)
    const count = await getTutorDailyBookingCount(tutorId, date)
    tutorDayBookings.set(key, count)
  }

  // Get per-lesson booking counts
  const lessonIds = allLessons.map(l => l.id)
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

  const sortedLessons = [...allLessons].sort((a, b) => {
    const aTime = query.sortBy === 'createdAt'
      ? new Date(a.createdAt).getTime()
      : new Date(a.startAt).getTime()
    const bTime = query.sortBy === 'createdAt'
      ? new Date(b.createdAt).getTime()
      : new Date(b.startAt).getTime()
    return query.sortDir === 'desc' ? bTime - aTime : aTime - bTime
  })

  const items = sortedLessons.map((lesson) => {
    const dateKey = getDateKey(new Date(lesson.startAt))
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
      status: lesson.status
    }
  })

  const total = items.length
  const paged = items.slice(query.offset, query.offset + query.limit)

  return c.json(buildPagedResponse(paged, total, query.limit, query.offset), HttpStatusCodes.OK)
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
      subjectId: lessons.subjectId,
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
    .innerJoin(subjects, eq(lessons.subjectId, subjects.id))
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
    buildPagedResponse(items, total ?? 0, query.limit, query.offset),
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
  const tomorrow = new Date(now)
  tomorrow.setHours(0, 0, 0, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const conditions = [
    gte(lessons.startAt, tomorrow),
    or(eq(lessons.status, 'scheduled'), eq(lessons.status, 'confirmed'))
  ]
  if (query.subjectId) {
    conditions.push(eq(lessons.subjectId, query.subjectId))
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

  const lessonRows = await db
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
    .innerJoin(subjects, eq(lessons.subjectId, subjects.id))
    .where(listWhere)
    .orderBy(direction)
    .limit(query.limit)
    .offset(query.offset)

  if (lessonRows.length === 0) {
    return c.json(buildPagedResponse([], total ?? 0, query.limit, query.offset), HttpStatusCodes.OK)
  }

  const lessonIds = lessonRows.map(row => row.id)
  const lessonDates = lessonRows.map(row => new Date(row.startAt))
  const minDate = new Date(Math.min(...lessonDates.map(date => date.getTime())))
  const maxDate = new Date(Math.max(...lessonDates.map(date => date.getTime())))
  minDate.setHours(0, 0, 0, 0)
  maxDate.setHours(23, 59, 59, 999)

  const [studentProfile, tokenBalance] = await Promise.all([
    db.query.studentProfiles.findFirst({
      where(fields, operators) {
        return operators.eq(fields.userId, currentUser.id)
      },
      columns: { isActive: true }
    }),
    getStudentTokenBalance(currentUser.id)
  ])

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
      lte(lessons.startAt, maxDate)
    ))

  const bookedDateKeys = new Set(studentDayBookings.map(row => getDateKey(new Date(row.startAt))))

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
  const subjectIds = [...new Set(lessonRows.map(row => row.subjectId))]
  const tutorCapacities = new Map<string, number>()
  for (const tutorId of tutorIds) {
    tutorCapacities.set(tutorId, await getTutorDailyCapacity(tutorId))
  }

  const allowedPairs = await db.query.tutorSubjects.findMany({
    where(fields, operators) {
      return operators.and(
        operators.inArray(fields.tutorId, tutorIds),
        operators.inArray(fields.subjectId, subjectIds)
      )
    },
    columns: { tutorId: true, subjectId: true }
  })
  const allowedSet = new Set(allowedPairs.map(pair => `${pair.tutorId}:${pair.subjectId}`))

  const tutorDayKeys = new Set<string>()
  for (const lesson of lessonRows) {
    const dateKey = getDateKey(new Date(lesson.startAt))
    tutorDayKeys.add(`${lesson.tutorId}:${dateKey}`)
  }

  const tutorDayBookings = new Map<string, number>()
  for (const key of tutorDayKeys) {
    const [tutorId, dateKey] = key.split(':')
    const date = new Date(dateKey)
    const count = await getTutorDailyBookingCount(tutorId, date)
    tutorDayBookings.set(key, count)
  }

  const items = lessonRows.map((lesson) => {
    const dateKey = getDateKey(new Date(lesson.startAt))
    const tutorDayKey = `${lesson.tutorId}:${dateKey}`
    const dailyCapacity = tutorCapacities.get(lesson.tutorId) ?? 1
    const dailyBookings = tutorDayBookings.get(tutorDayKey) ?? 0
    const lessonBookings = lessonBookingCounts.get(lesson.id) ?? 0
    const availableSeats = Math.max(0, lesson.seats - lessonBookings)

    const bookingCutoff = new Date(lesson.startAt)
    bookingCutoff.setDate(bookingCutoff.getDate() - 1)
    bookingCutoff.setHours(20, 0, 0, 0)

    const canBook = studentActive
      && hasTokens
      && lesson.status === 'scheduled'
      && !sameDayOrAfter(now, new Date(lesson.startAt))
      && now < bookingCutoff
      && !bookedLessonIds.has(lesson.id)
      && !bookedDateKeys.has(dateKey)
      && dailyBookings < dailyCapacity
      && lessonBookings < lesson.seats
      && allowedSet.has(`${lesson.tutorId}:${lesson.subjectId}`)

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
      canBook
    }
  })

  return c.json(
    buildPagedResponse(items, total ?? 0, query.limit, query.offset),
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
      countsForTutor: true
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

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
      countsForTutor: lesson.countsForTutor ?? false
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

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  if (!isAdmin) {
    if (lesson.status === 'canceled' || lesson.status === 'completed') {
      return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
    }

    const allowed = await isSubjectAllowed(lesson.tutorId, lesson.subjectId)
    if (!allowed) {
      return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
    }

    if (lesson.status !== 'scheduled') {
      return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
    }

    const lessonStart = new Date(lesson.startAt)
    if (sameDayOrAfter(new Date(), lessonStart)) {
      return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
    }

    const bookingCutoff = new Date(lessonStart)
    bookingCutoff.setDate(lessonStart.getDate() - 1)
    bookingCutoff.setHours(20, 0, 0, 0)
    if (new Date() >= bookingCutoff) {
      return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
    }
  }

  const studentProfile = await db.query.studentProfiles.findFirst({
    where(fields, operators) {
      return operators.eq(fields.userId, studentUser.id)
    },
    columns: {
      isActive: true
    }
  })

  if (!studentProfile?.isActive) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  if (!isAdmin) {
    const tokenBalance = await getStudentTokenBalance(studentUser.id)
    if (tokenBalance <= 0) {
      return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
    }

    const existingBooking = await db.query.lessonBookings.findFirst({
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
      return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
    }

    const studentDailyBookings = await getStudentDailyBookingCount(studentUser.id, new Date(lesson.startAt))
    if (studentDailyBookings >= 1) {
      return c.json(buildErrorResponse(HttpStatusPhrases.STUDENT_DAILY_BOOKING_LIMIT), HttpStatusCodes.CONFLICT)
    }
  }

  const dailyCapacity = await getTutorDailyCapacity(lesson.tutorId)
  const dailyBookings = await getTutorDailyBookingCount(lesson.tutorId, new Date(lesson.startAt))

  const bookingCount = await db.query.lessonBookings.findMany({
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
      return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
    }

    if (bookingCount.length >= lesson.seats) {
      return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
    }
  }

  const [booking] = await db.insert(lessonBookings).values({
    lessonId: lesson.id,
    studentId: studentUser.id,
    topic: payload.topic,
    status: 'confirmed',
    countsForStudent: true
  }).returning({
    id: lessonBookings.id,
    lessonId: lessonBookings.lessonId,
    studentId: lessonBookings.studentId,
    topic: lessonBookings.topic,
    status: lessonBookings.status,
    countsForStudent: lessonBookings.countsForStudent,
    studentPresence: lessonBookings.studentPresence,
    studentPresenceAt: lessonBookings.studentPresenceAt
  })

  await db.insert(tokenLedger).values({
    studentId: studentUser.id,
    lessonId: lesson.id,
    delta: -1,
    reason: 'lesson_booking'
  })

  const lessonDetails = await fetchLessonEmailDetails(lesson.id, lesson.tutorId, lesson.subjectId)
  const studentsMap = await fetchStudentsDetails([studentUser.id])
  const studentDetails = studentsMap.get(studentUser.id)
  if (lessonDetails && studentDetails) {
    const studentMessage = buildLessonBookingConfirmedMessage({
      recipientRole: 'student',
      lessonStartAt: new Date(lesson.startAt),
      subjectName: lessonDetails.subjectName,
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

  if (lesson.status === 'scheduled') {
    await db.update(lessons)
      .set({ status: 'confirmed' })
      .where(eq(lessons.id, lesson.id))
  }

  const updatedConfirmedCount = bookingCount.length + 1
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
        status: lesson.status
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

  const now = new Date()
  const lessonStart = new Date(lesson.startAt)
  const cutoff = new Date(lessonStart)
  cutoff.setDate(lessonStart.getDate() - 1)
  cutoff.setHours(20, 0, 0, 0)

  let countsForStudent = false
  if (currentUser.role === 'admin') {
    countsForStudent = payload?.countsForStudent ?? false
  }
  else {
    countsForStudent = now >= cutoff
  }

  const shouldRefund = !countsForStudent

  await db.update(lessonBookings)
    .set({
      status: 'canceled',
      canceledAt: new Date(),
      canceledBy: currentUser.id,
      studentPresence: null,
      studentPresenceAt: null,
      countsForStudent
    })
    .where(eq(lessonBookings.id, bookingId))

  if (lesson.status === 'confirmed') {
    const remaining = await db.query.lessonBookings.findMany({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.lessonId, lesson.id),
          operators.eq(fields.status, 'confirmed')
        )
      },
      columns: { id: true }
    })

    if (remaining.length === 0) {
      await db.update(lessons)
        .set({ status: 'scheduled' })
        .where(eq(lessons.id, lesson.id))
    }
  }

  if (shouldRefund) {
    await db.insert(tokenLedger).values({
      studentId: booking.studentId,
      lessonId: lesson.id,
      delta: 1,
      reason: 'lesson_cancel_student'
    })
  }

  const lessonDetails = await fetchLessonEmailDetails(lesson.id, lesson.tutorId, lesson.subjectId)
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

  const updated = await db.query.lessonBookings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, bookingId)
    },
    columns: {
      id: true,
      lessonId: true,
      studentId: true,
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

  if (isTutor) {
    const confirmedBookings = await db.query.lessonBookings.findMany({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.lessonId, lesson.id),
          operators.eq(fields.status, 'confirmed')
        )
      },
      columns: { id: true }
    })

    if (confirmedBookings.length > 0) {
      return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
    }
  }

  const countsForTutor = isAdmin ? (payload?.countsForTutor ?? false) : false

  await db.update(lessons)
    .set({ status: 'canceled', countsForTutor })
    .where(eq(lessons.id, lessonId))

  let confirmedStudentIds: string[] = []
  if (isAdmin) {
    const confirmedBookings = await db.query.lessonBookings.findMany({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.lessonId, lesson.id),
          operators.eq(fields.status, 'confirmed')
        )
      },
      columns: { studentId: true }
    })
    confirmedStudentIds = confirmedBookings.map(booking => booking.studentId)
    await cancelConfirmedBookings(lessonId, currentUser.id)
  }

  if (isAdmin && confirmedStudentIds.length > 0) {
    const lessonDetails = await fetchLessonEmailDetails(lesson.id, lesson.tutorId, lesson.subjectId)
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
      status: lessons.status
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

  if (isTutor && !withinLessonWeek(new Date(lesson.startAt))) {
    return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
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

  const presenceAt = payload.present === null ? null : new Date()
  await db.update(lessonBookings)
    .set({
      studentPresence: payload.present ?? null,
      studentPresenceAt: presenceAt
    })
    .where(eq(lessonBookings.id, bookingId))

  if (payload.present === true && (isTutor || isAdmin) && !lesson.countsForTutor) {
    await db.update(lessons)
      .set({ countsForTutor: true })
      .where(eq(lessons.id, lesson.id))
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

  const countsForStudentChanged = booking.countsForStudent !== payload.countsForStudent

  const [updated] = await db.update(lessonBookings)
    .set({ countsForStudent: payload.countsForStudent })
    .where(eq(lessonBookings.id, bookingId))
    .returning({
      id: lessonBookings.id,
      lessonId: lessonBookings.lessonId,
      studentId: lessonBookings.studentId,
      topic: lessonBookings.topic,
      status: lessonBookings.status,
      countsForStudent: lessonBookings.countsForStudent,
      studentPresence: lessonBookings.studentPresence,
      studentPresenceAt: lessonBookings.studentPresenceAt
    })

  if (countsForStudentChanged) {
    const delta = payload.countsForStudent ? -1 : 1
    await db.insert(tokenLedger).values({
      studentId: booking.studentId,
      lessonId: booking.lessonId,
      delta,
      reason: 'lesson_counts_adjusted'
    })
  }

  return c.json({
    ...updated,
    studentPresenceAt: updated.studentPresenceAt ? updated.studentPresenceAt.toISOString() : null
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

  if (lesson.status === 'completed' || lesson.status === 'canceled') {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const newStartAt = new Date(payload.startAt)

  const dailyCapacity = await getTutorDailyCapacity(payload.tutorId)
  const seats = dailyCapacity

  const [newLesson] = await db.insert(lessons).values({
    tutorId: payload.tutorId,
    subjectId: payload.subjectId,
    startAt: newStartAt,
    durationMinutes: payload.durationMinutes,
    seats,
    status: lesson.status
  }).returning({
    id: lessons.id,
    countsForTutor: lessons.countsForTutor
  })

  await db.update(lessons)
    .set({ status: 'canceled', countsForTutor: false })
    .where(eq(lessons.id, lesson.id))

  const existingBookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lesson.id),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: {
      id: true,
      studentId: true,
      topic: true,
      countsForStudent: true,
      studentPresence: true,
      studentPresenceAt: true
    }
  })

  if (existingBookings.length > 0) {
    const bookingIdMap = new Map<string, string>()
    const newBookingRows = existingBookings.map((booking) => {
      const newId = randomUUID()
      bookingIdMap.set(booking.id, newId)
      return {
        id: newId,
        lessonId: newLesson.id,
        studentId: booking.studentId,
        topic: booking.topic,
        status: 'confirmed',
        countsForStudent: booking.countsForStudent,
        studentPresence: booking.studentPresence,
        studentPresenceAt: booking.studentPresenceAt
      }
    })

    await db.insert(lessonBookings).values(newBookingRows)

    if (existingBookings.some(booking => booking.studentPresence === true)) {
      await db.update(lessons)
        .set({ countsForTutor: true })
        .where(eq(lessons.id, newLesson.id))
    }

    for (const [oldBookingId, newBookingId] of bookingIdMap) {
      await db.update(lessonFeedback)
        .set({
          lessonId: newLesson.id,
          bookingId: newBookingId
        })
        .where(eq(lessonFeedback.bookingId, oldBookingId))
    }

    await db.update(lessonBookings)
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

  if (existingBookings.length > 0) {
    const studentIds = existingBookings.map(booking => booking.studentId)
    const studentsMap = await fetchStudentsDetails(studentIds)
    const oldDetails = await fetchLessonEmailDetails(lesson.id, lesson.tutorId, lesson.subjectId)
    const newDetails = await fetchLessonEmailDetails(newLesson.id, payload.tutorId, payload.subjectId)

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

  return c.json(
    {
      message: 'Lezione creata',
      lessonId: newLesson.id
    },
    HttpStatusCodes.CREATED
  )
}
