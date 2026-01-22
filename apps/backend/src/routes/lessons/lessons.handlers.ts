// Purpose: Lesson booking handlers enforcing availability and token rules.
import type { SQL } from 'drizzle-orm'
import type { Context } from 'hono'

import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { buildBookingCanceledByAdminMessage } from '@/lib/email-templates'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { sendMail } from '@/lib/mailer'
import { buildPagedResponse } from '@/lib/pagination'

import type {
  BookGeneratedLessonRoute,
  CancelBookingRoute,
  CancelLessonRoute,
  GetLessonRoute,
  ListLessonBookingsRoute,
  ListLessonsRoute,
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

function ensureStudent(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'student') {
    forbid()
  }
  return currentUser
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
  return settings?.dailyCapacity ?? 2
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

    const profile = await db.query.studentProfiles.findFirst({
      where(fields, operators) {
        return operators.eq(fields.userId, booking.studentId)
      },
      columns: { lessonTokens: true }
    })

    if (profile) {
      await db.update(studentProfiles)
        .set({ lessonTokens: profile.lessonTokens + 1 })
        .where(eq(studentProfiles.userId, booking.studentId))

      await db.insert(tokenLedger).values({
        studentId: booking.studentId,
        lessonId,
        delta: 1,
        reason: 'lesson_cancel_admin'
      })
    }
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

  const allLessons = await db.query.lessons.findMany({
    where() {
      return and(...clauses)
    },
    columns: {
      id: true,
      tutorId: true,
      subjectId: true,
      startAt: true,
      durationMinutes: true,
      seats: true,
      status: true,
      createdAt: true,
      countsForTutor: true
    },
    orderBy: direction
  })

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
    const dailyCapacity = tutorCapacities.get(lesson.tutorId) ?? 2
    const lessonBookings = lessonBookingCounts.get(lesson.id) ?? 0

    return {
      id: lesson.id,
      tutorId: lesson.tutorId,
      subjectId: lesson.subjectId,
      startAt: new Date(lesson.startAt).toISOString(),
      durationMinutes: lesson.durationMinutes,
      lessonCapacity: lesson.seats,
      dailyCapacity,
      availableSeats: Math.max(0, Math.min(
        lesson.seats - lessonBookings,
        dailyCapacity - dailyBookings
      )),
      countsForTutor: lesson.countsForTutor ?? false,
      status: lesson.status
    }
  })

  const total = items.length
  const paged = items.slice(query.offset, query.offset + query.limit)

  return c.json(buildPagedResponse(paged, total, query.limit, query.offset), HttpStatusCodes.OK)
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
  const student = ensureStudent(c)

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

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

  if (sameDayOrAfter(new Date(), new Date(lesson.startAt))) {
    return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
  }

  const studentProfile = await db.query.studentProfiles.findFirst({
    where(fields, operators) {
      return operators.eq(fields.userId, student.id)
    },
    columns: {
      lessonTokens: true,
      isActive: true
    }
  })

  if (!studentProfile?.isActive) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  if (studentProfile.lessonTokens <= 0) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  const existingBooking = await db.query.lessonBookings.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lesson.id),
        operators.eq(fields.studentId, student.id),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: { id: true }
  })

  if (existingBooking) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  // Check tutor's daily capacity
  const dailyCapacity = await getTutorDailyCapacity(lesson.tutorId)
  const dailyBookings = await getTutorDailyBookingCount(lesson.tutorId, new Date(lesson.startAt))
  if (dailyBookings >= dailyCapacity) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  // Check per-lesson seat limit
  const bookingCount = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lesson.id),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: { id: true }
  })

  if (bookingCount.length >= lesson.seats) {
    return c.json(buildErrorResponse(HttpStatusPhrases.CONFLICT), HttpStatusCodes.CONFLICT)
  }

  const [booking] = await db.insert(lessonBookings).values({
    lessonId: lesson.id,
    studentId: student.id,
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

  await db.update(studentProfiles)
    .set({ lessonTokens: studentProfile.lessonTokens - 1 })
    .where(eq(studentProfiles.userId, student.id))

  await db.insert(tokenLedger).values({
    studentId: student.id,
    lessonId: lesson.id,
    delta: -1,
    reason: 'lesson_booking'
  })

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
    const studentProfile = await db.query.studentProfiles.findFirst({
      where(fields, operators) {
        return operators.eq(fields.userId, booking.studentId)
      },
      columns: { lessonTokens: true }
    })

    if (studentProfile) {
      await db.update(studentProfiles)
        .set({ lessonTokens: studentProfile.lessonTokens + 1 })
        .where(eq(studentProfiles.userId, booking.studentId))

      await db.insert(tokenLedger).values({
        studentId: booking.studentId,
        lessonId: lesson.id,
        delta: 1,
        reason: 'lesson_cancel_student'
      })
    }
  }

  if (currentUser.role === 'admin') {
    const usersFound = await db.query.users.findMany({
      where(fields, operators) {
        return operators.inArray(fields.id, [booking.studentId, lesson.tutorId])
      },
      columns: { id: true, email: true }
    })

    const recipients = usersFound
    for (const recipient of recipients) {
      if (!recipient.email) {
        continue
      }
      const role = recipient.id === booking.studentId ? 'student' : 'tutor'
      const message = buildBookingCanceledByAdminMessage(role, new Date(lesson.startAt))
      sendMail({
        to: recipient.email,
        subject: message.subject,
        text: message.text,
        html: message.html
      }).catch(err => console.error('Failed to send cancel booking email:', err))
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

  if (isAdmin) {
    await cancelConfirmedBookings(lessonId, currentUser.id)
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

  const presenceAt = new Date()
  await db.update(lessonBookings)
    .set({
      studentPresence: payload.present,
      studentPresenceAt: presenceAt
    })
    .where(eq(lessonBookings.id, bookingId))

  if (payload.present && (isTutor || isAdmin) && !lesson.countsForTutor) {
    await db.update(lessons)
      .set({ countsForTutor: true })
      .where(eq(lessons.id, lesson.id))
  }

  return c.json(
    {
      status: booking.status,
      studentPresence: payload.present,
      studentPresenceAt: presenceAt.toISOString()
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

  const subjectAllowed = await isSubjectAllowed(payload.tutorId, payload.subjectId)
  if (!subjectAllowed) {
    return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
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
      studentId: true,
      topic: true,
      countsForStudent: true,
      studentPresence: true,
      studentPresenceAt: true
    }
  })

  if (existingBookings.length > 0) {
    await db.insert(lessonBookings).values(existingBookings.map(booking => ({
      lessonId: newLesson.id,
      studentId: booking.studentId,
      topic: booking.topic,
      status: 'confirmed',
      countsForStudent: booking.countsForStudent,
      studentPresence: booking.studentPresence,
      studentPresenceAt: booking.studentPresenceAt
    })))

    if (existingBookings.some(booking => booking.studentPresence === true)) {
      await db.update(lessons)
        .set({ countsForTutor: true })
        .where(eq(lessons.id, newLesson.id))
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

  return c.json(
    {
      message: 'Lezione riprogrammata',
      lessonId: newLesson.id
    },
    HttpStatusCodes.OK
  )
}
