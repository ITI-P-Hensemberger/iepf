// Purpose: Lesson lists and details: all lessons, a student's lessons, bookable lessons, the schedule and bookings.
import type { SQL } from 'drizzle-orm'

import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, lte, or, sql } from 'drizzle-orm'

import type { AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { wasTutorOf } from '@/lib/lesson-history'
import { bookingMatches, dateMatches, likePattern, personMatches, subjectMatches } from '@/lib/lesson-search'
import { getStudentTokenBalance } from '@/lib/lesson-tokens'
import { buildPagedResponse } from '@/lib/pagination'
import { addDays, bookingCutoff, schoolDayKey, schoolDayRange, schoolTime } from '@/lib/school-time'

import type {
  GetAvailableSummaryRoute,
  GetLessonRoute,
  ListAvailableLessonsRoute,
  ListLessonBookingsRoute,
  ListLessonsRoute,
  ListMyLessonsRoute,
  ListScheduleRoute
} from './lessons.routes'

import {
  fetchStudentsDetails,
  forbid,
  getTutorDailyBookingCount,
  getTutorDailyCapacity,
  getTutorSubjectOptions,
  lessonOffersSubject,
  sameDayOrAfter,
  subjectOptionsFor
} from './lessons.shared'

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

  // Free text: the day ("13/11"), the tutor, the subject, or a booking's student (name, email,
  // class), topic or subject.
  const pattern = query.q ? likePattern(query.q) : null
  const listWhere = pattern
    ? and(
        ...clauses,
        or(
          dateMatches(lessons.startAt, query.q ?? '', pattern),
          personMatches(lessons.tutorId, pattern),
          subjectMatches(lessons.subjectId, pattern),
          bookingMatches(lessons.id, pattern)
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
  const query = c.req.valid('query')
  const isAdmin = currentUser?.role === 'admin' && currentUser.isActive === true
  // A student sees their own bookings; an admin sees the ones of the student they ask for.
  const studentId = currentUser?.role === 'student'
    ? currentUser.id
    : isAdmin ? query.studentId : undefined
  if (!studentId) {
    forbid()
  }

  const conditions = [eq(lessonBookings.studentId, studentId)]
  if (query.q) {
    // Free text: the day ("13/11"), the tutor (name or email), the subject or the topic.
    const pattern = likePattern(query.q)
    conditions.push(or(
      dateMatches(lessons.startAt, query.q, pattern),
      personMatches(lessons.tutorId, pattern),
      subjectMatches(lessonBookings.subjectId, pattern),
      ilike(lessonBookings.topic, pattern)
    )!)
  }
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

interface AvailableFilters {
  subjectId?: string
  from?: string
  to?: string
  sortDir?: 'asc' | 'desc'
}

// The lessons a student may see on the booking page, each with whether they can book it now.
// Without a page every matching lesson is loaded; with one, only that slice.
async function loadAvailableLessons(studentId: string, filters: AvailableFilters, page?: { limit: number, offset: number }) {
  const now = new Date()
  const tomorrow = schoolTime(addDays(schoolDayKey(now), 1))

  const studentProfile = await db.query.studentProfiles.findFirst({
    where(fields, operators) {
      return operators.eq(fields.userId, studentId)
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
  if (filters.subjectId) {
    conditions.push(lessonOffersSubject(filters.subjectId))
  }
  if (filters.from) {
    conditions.push(gte(lessons.startAt, new Date(filters.from)))
  }
  if (filters.to) {
    conditions.push(lte(lessons.startAt, new Date(filters.to)))
  }

  const listWhere = and(...conditions)
  const direction = filters.sortDir === 'desc' ? desc(lessons.startAt) : asc(lessons.startAt)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(lessons)
    .where(listWhere)

  const lessonRowsQuery = db
    .select({
      id: lessons.id,
      tutorId: lessons.tutorId,
      tutorFirstName: users.firstName,
      tutorLastName: users.lastName,
      tutorYear: tutorProfiles.year,
      subjectId: lessons.subjectId,
      subjectName: subjects.name,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      seats: lessons.seats,
      status: lessons.status
    })
    .from(lessons)
    .innerJoin(users, eq(lessons.tutorId, users.id))
    .leftJoin(tutorProfiles, eq(tutorProfiles.userId, lessons.tutorId))
    .leftJoin(subjects, eq(lessons.subjectId, subjects.id))
    .where(listWhere)
    // Lessons can start together: without the id they could repeat or vanish between pages.
    .orderBy(direction, asc(lessons.id))

  const lessonRows = page
    ? await lessonRowsQuery.limit(page.limit).offset(page.offset)
    : await lessonRowsQuery

  if (lessonRows.length === 0) {
    return { total: Number(total ?? 0), items: [], bookedDays: new Set<string>() }
  }

  const lessonIds = lessonRows.map(row => row.id)
  const lessonDates = lessonRows.map(row => new Date(row.startAt))
  const minDate = schoolDayRange(new Date(Math.min(...lessonDates.map(date => date.getTime())))).start
  const maxDate = schoolDayRange(new Date(Math.max(...lessonDates.map(date => date.getTime())))).end

  const tokenBalance = await getStudentTokenBalance(studentId)

  const studentActive = studentProfile?.isActive === true
  const hasTokens = tokenBalance > 0

  const existingBookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.inArray(fields.lessonId, lessonIds),
        operators.eq(fields.studentId, studentId),
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
      eq(lessonBookings.studentId, studentId),
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
      tutorYear: lesson.tutorYear ?? null,
      subjectId: lesson.subjectId,
      subjectName: lesson.subjectName,
      startAt: new Date(lesson.startAt).toISOString(),
      durationMinutes: lesson.durationMinutes,
      lessonCapacity: lesson.seats,
      dailyCapacity,
      dailyOccupancy: dailyBookings,
      availableSeats,
      status: lesson.status,
      bookingCutoff: cutoff.toISOString(),
      subjectOptions,
      canBook: canBook && subjectOptions.length > 0
    }
  })

  return { total: Number(total ?? 0), items, bookedDays: bookedDateKeys }
}

export const listAvailableLessons: AppRouteHandler<ListAvailableLessonsRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'student') {
    forbid()
  }

  const query = c.req.valid('query')
  // The first page puts the lessons the student can book first, so it needs them all.
  const prioritizeCanBook = query.offset === 0
  const { total, items } = await loadAvailableLessons(
    currentUser.id,
    query,
    prioritizeCanBook ? undefined : { limit: query.limit, offset: query.offset }
  )

  const pagedItems = prioritizeCanBook
    ? [
        ...items.filter(item => item.canBook),
        ...items.filter(item => !item.canBook)
      ].slice(0, query.limit)
    : items

  return c.json(
    buildPagedResponse(pagedItems, total, query.limit, query.offset),
    HttpStatusCodes.OK
  )
}

// How many lessons the student can book per subject and, for the chosen subject, per day.
export const getAvailableSummary: AppRouteHandler<GetAvailableSummaryRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'student') {
    forbid()
  }

  const query = c.req.valid('query')
  const { items, bookedDays } = await loadAvailableLessons(currentUser.id, { from: query.from, to: query.to })
  const bookable = items.filter(item => item.canBook)

  const subjectCounts = new Map<string, { id: string, name: string, count: number }>()
  for (const item of bookable) {
    for (const option of item.subjectOptions) {
      const entry = subjectCounts.get(option.id) ?? { ...option, count: 0 }
      entry.count += 1
      subjectCounts.set(option.id, entry)
    }
  }

  const dayCounts = new Map<string, number>()
  for (const item of bookable) {
    if (query.subjectId && !item.subjectOptions.some(option => option.id === query.subjectId)) {
      continue
    }
    const day = schoolDayKey(new Date(item.startAt))
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
  }

  // Days with a booking count even when no lesson is left to show, so the page can say why.
  const studentDays = await db
    .select({ startAt: lessons.startAt })
    .from(lessonBookings)
    .innerJoin(lessons, eq(lessonBookings.lessonId, lessons.id))
    .where(and(
      eq(lessonBookings.studentId, currentUser.id),
      eq(lessonBookings.status, 'confirmed'),
      gte(lessons.startAt, new Date(query.from)),
      lte(lessons.startAt, new Date(query.to))
    ))
  for (const row of studentDays) {
    bookedDays.add(schoolDayKey(new Date(row.startAt)))
  }

  return c.json({
    subjects: [...subjectCounts.values()].sort((a, b) => a.name.localeCompare(b.name, 'it')),
    days: [...new Set([...dayCounts.keys(), ...bookedDays])].sort().map(day => ({
      day,
      count: dayCounts.get(day) ?? 0,
      booked: bookedDays.has(day)
    }))
  }, HttpStatusCodes.OK)
}

// Lessons with their bookings for a day or a week: admins see every tutor, a tutor only their own.
export const listSchedule: AppRouteHandler<ListScheduleRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  const isAdmin = currentUser?.role === 'admin' && currentUser.isActive === true
  const isTutor = currentUser?.role === 'tutor'
  if (!currentUser || (!isAdmin && !isTutor)) {
    forbid()
  }

  const query = c.req.valid('query')
  const from = new Date(query.from)
  const to = new Date(query.to)
  if (to.getTime() - from.getTime() > 15 * 24 * 60 * 60 * 1000 || to < from) {
    return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
  }
  const tutorId = isTutor ? currentUser.id : query.tutorId

  const rows = await db
    .select({
      id: lessons.id,
      tutorId: lessons.tutorId,
      tutorFirstName: users.firstName,
      tutorLastName: users.lastName,
      tutorYear: tutorProfiles.year,
      subjectId: lessons.subjectId,
      subjectName: subjects.name,
      subjectFromBooking: lessons.subjectFromBooking,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      seats: lessons.seats,
      status: lessons.status
    })
    .from(lessons)
    .innerJoin(users, eq(lessons.tutorId, users.id))
    .leftJoin(tutorProfiles, eq(tutorProfiles.userId, lessons.tutorId))
    .leftJoin(subjects, eq(lessons.subjectId, subjects.id))
    .where(and(
      gte(lessons.startAt, from),
      lte(lessons.startAt, to),
      ...(tutorId ? [eq(lessons.tutorId, tutorId)] : []),
      ...(query.subjectId ? [lessonOffersSubject(query.subjectId)] : [])
    ))
    .orderBy(asc(lessons.startAt), asc(users.lastName), asc(lessons.id))

  const lessonIds = rows.map(row => row.id)
  const bookingRows = lessonIds.length
    ? await db
        .select({
          id: lessonBookings.id,
          lessonId: lessonBookings.lessonId,
          studentId: lessonBookings.studentId,
          firstName: users.firstName,
          lastName: users.lastName,
          subjectId: lessonBookings.subjectId,
          topic: lessonBookings.topic,
          studentPresence: lessonBookings.studentPresence
        })
        .from(lessonBookings)
        .innerJoin(users, eq(lessonBookings.studentId, users.id))
        .where(and(inArray(lessonBookings.lessonId, lessonIds), eq(lessonBookings.status, 'confirmed')))
        .orderBy(asc(lessonBookings.createdAt))
    : []
  const students = await fetchStudentsDetails(bookingRows.map(row => row.studentId))
  const bookingsByLesson = new Map<string, typeof bookingRows>()
  for (const row of bookingRows) {
    const list = bookingsByLesson.get(row.lessonId) ?? []
    list.push(row)
    bookingsByLesson.set(row.lessonId, list)
  }

  const tutorIds = [...new Set(rows.map(row => row.tutorId))]
  const tutorOptions = await getTutorSubjectOptions(tutorIds)
  const capacities = new Map<string, number>()
  for (const id of tutorIds) {
    capacities.set(id, await getTutorDailyCapacity(id))
  }

  const now = new Date()
  const items = rows.map((row) => {
    const lessonBookingsList = bookingsByLesson.get(row.id) ?? []
    return {
      id: row.id,
      tutorId: row.tutorId,
      tutorName: `${row.tutorFirstName} ${row.tutorLastName}`.trim(),
      tutorYear: row.tutorYear ?? null,
      tutorDailyCapacity: capacities.get(row.tutorId) ?? 1,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      subjectFromBooking: row.subjectFromBooking,
      subjectOptions: row.subjectId ? [] : (tutorOptions.get(row.tutorId) ?? []),
      startAt: row.startAt.toISOString(),
      durationMinutes: row.durationMinutes,
      seats: row.seats,
      status: row.status,
      bookingsOpen: now < bookingCutoff(row.startAt) && row.status !== 'canceled',
      bookings: lessonBookingsList.map(booking => ({
        id: booking.id,
        studentId: booking.studentId,
        studentName: `${booking.firstName} ${booking.lastName}`.trim(),
        classLabel: students.get(booking.studentId)?.classLabel ?? null,
        subjectId: booking.subjectId,
        topic: booking.topic,
        studentPresence: booking.studentPresence
      }))
    }
  })

  return c.json({ data: items }, HttpStatusCodes.OK)
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
    return c.json(buildErrorResponse('Lezione non trovata.'), HttpStatusCodes.NOT_FOUND)
  }

  // Only admins and the lesson's own tutor open it; a tutor it was taken from learns why.
  const isAdmin = currentUser.role === 'admin' && currentUser.isActive === true
  if (!isAdmin && !(currentUser.role === 'tutor' && currentUser.id === lesson.tutorId)) {
    const message = currentUser.role === 'tutor' && await wasTutorOf(lesson.id, currentUser.id)
      ? 'Questa lezione è stata affidata a un altro tutor: non devi più tenerla.'
      : 'Questa lezione non è tra le tue.'
    return c.json(buildErrorResponse(message), HttpStatusCodes.FORBIDDEN)
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
