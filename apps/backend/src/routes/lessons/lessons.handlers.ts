// Purpose: Lesson booking handlers enforcing availability and token rules.
import type { Context } from 'hono'

import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import env from '@/env'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type {
  BookLessonRoute,
  CancelBookingRoute,
  CancelLessonRoute,
  ConfirmLessonBookingRoute,
  ConfirmLessonTutorRoute,
  GetLessonConfirmationsRoute,
  ListLessonConfirmationsRoute,
  OverrideLessonConfirmationsRoute,
  RescheduleLessonRoute,
  ResolveLessonRoute
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
  if (!currentUser || currentUser.role !== 'admin') {
    forbid()
  }
  return currentUser
}

function lessonEndTime(lesson: { startAt: Date | number, durationMinutes: number }) {
  const start = new Date(lesson.startAt)
  const end = new Date(start)
  end.setMinutes(end.getMinutes() + lesson.durationMinutes)
  return end
}

function canConfirmLesson(lesson: { startAt: Date | number, durationMinutes: number }) {
  // Confirmations open one minute after the scheduled end time.
  const windowStart = lessonEndTime(lesson)
  windowStart.setMinutes(windowStart.getMinutes() + 1)
  return new Date() >= windowStart
}

function confirmationStallDeadline(lesson: { startAt: Date | number, durationMinutes: number }) {
  const deadline = lessonEndTime(lesson)
  deadline.setMinutes(deadline.getMinutes() + env.LESSON_CONFIRMATION_STALL_MINUTES)
  return deadline
}

async function autoStallLessonIfNeeded(lesson: {
  id: string
  status: string
  startAt: Date | number
  durationMinutes: number
  tutorConfirmed: boolean | null
}, bookings: Array<{
  studentConfirmed: boolean | null
}>) {
  if (lesson.status !== 'scheduled') {
    return lesson.status
  }

  // Auto-stall overdue lessons without full confirmations.
  if (new Date() <= confirmationStallDeadline(lesson)) {
    return lesson.status
  }

  const allConfirmed = lesson.tutorConfirmed === true
    && bookings.length > 0
    && bookings.every(booking => booking.studentConfirmed === true)

  if (allConfirmed) {
    return lesson.status
  }

  await db.update(lessons)
    .set({ status: 'stalled' })
    .where(eq(lessons.id, lesson.id))

  return 'stalled'
}

function sameDayOrAfter(a: Date, b: Date) {
  const aDay = new Date(a)
  aDay.setHours(0, 0, 0, 0)
  const bDay = new Date(b)
  bDay.setHours(0, 0, 0, 0)
  return aDay.getTime() >= bDay.getTime()
}

async function ensureTutorExists(tutorId: string) {
  return db.query.users.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, tutorId),
        operators.eq(fields.role, 'tutor')
      )
    },
    columns: { id: true }
  })
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

export const bookLesson: AppRouteHandler<BookLessonRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const student = ensureStudent(c)

  const tutor = await ensureTutorExists(tutorId)
  if (!tutor) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const subject = await db.query.subjects.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, payload.subjectId)
    },
    columns: { id: true }
  })

  if (!subject) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const allowed = await isSubjectAllowed(tutorId, payload.subjectId)
  if (!allowed) {
    return c.json({ message: HttpStatusPhrases.BAD_REQUEST }, HttpStatusCodes.BAD_REQUEST)
  }

  const availability = await db.query.tutorAvailability.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, payload.availabilityId),
        operators.eq(fields.tutorId, tutorId)
      )
    }
  })

  if (!availability) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const startAt = new Date(availability.startAt)
  if (sameDayOrAfter(new Date(), startAt)) {
    return c.json({ message: HttpStatusPhrases.BAD_REQUEST }, HttpStatusCodes.BAD_REQUEST)
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
    return c.json({ message: HttpStatusPhrases.FORBIDDEN }, HttpStatusCodes.FORBIDDEN)
  }

  if (studentProfile.lessonTokens <= 0) {
    return c.json({ message: HttpStatusPhrases.FORBIDDEN }, HttpStatusCodes.FORBIDDEN)
  }

  let lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.availabilityId, availability.id)
    }
  })

  if (lesson && lesson.subjectId !== payload.subjectId) {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  if (lesson && lesson.status !== 'scheduled') {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  if (!lesson) {
    const [created] = await db.insert(lessons).values({
      tutorId,
      subjectId: payload.subjectId,
      availabilityId: availability.id,
      startAt,
      durationMinutes: availability.durationMinutes,
      seats: availability.seats
    }).returning({
      id: lessons.id,
      tutorId: lessons.tutorId,
      subjectId: lessons.subjectId,
      availabilityId: lessons.availabilityId,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      seats: lessons.seats,
      status: lessons.status,
      tutorConfirmed: lessons.tutorConfirmed,
      tutorConfirmedAt: lessons.tutorConfirmedAt,
      tutorConfirmationNote: lessons.tutorConfirmationNote,
      adminResolvedAt: lessons.adminResolvedAt,
      adminResolvedBy: lessons.adminResolvedBy,
      adminResolutionNote: lessons.adminResolutionNote,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt
    })
    lesson = created
  }

  const existingBooking = await db.query.lessonBookings.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lesson!.id),
        operators.eq(fields.studentId, student.id),
        operators.eq(fields.status, 'booked')
      )
    },
    columns: { id: true }
  })

  if (existingBooking) {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  const bookingCount = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lesson!.id),
        operators.eq(fields.status, 'booked')
      )
    },
    columns: { id: true }
  })

  if (bookingCount.length >= lesson!.seats) {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  const [booking] = await db.insert(lessonBookings).values({
    lessonId: lesson!.id,
    studentId: student.id,
    topic: payload.topic
  }).returning({
    id: lessonBookings.id,
    lessonId: lessonBookings.lessonId,
    studentId: lessonBookings.studentId,
    topic: lessonBookings.topic,
    status: lessonBookings.status
  })

  await db.update(studentProfiles)
    .set({ lessonTokens: studentProfile.lessonTokens - 1 })
    .where(eq(studentProfiles.userId, student.id))

  await db.insert(tokenLedger).values({
    studentId: student.id,
    lessonId: lesson!.id,
    delta: -1,
    reason: 'lesson_booking'
  })

  return c.json(
    {
      lesson: {
        id: lesson!.id,
        tutorId: lesson!.tutorId,
        subjectId: lesson!.subjectId,
        startAt: new Date(lesson!.startAt).toISOString(),
        durationMinutes: lesson!.durationMinutes,
        seats: lesson!.seats,
        status: lesson!.status
      },
      booking
    },
    HttpStatusCodes.CREATED
  )
}

export const cancelBooking: AppRouteHandler<CancelBookingRoute> = async (c) => {
  const { lessonId, bookingId } = c.req.valid('param')
  const currentUser = c.get('currentUser')
  if (!currentUser) {
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
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  if (currentUser.role !== 'admin' && booking.studentId !== currentUser.id) {
    return c.json({ message: HttpStatusPhrases.FORBIDDEN }, HttpStatusCodes.FORBIDDEN)
  }

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const shouldRefund = currentUser.role === 'admin'
    ? true
    : !sameDayOrAfter(new Date(), new Date(lesson.startAt))

  await db.update(lessonBookings)
    .set({
      status: 'canceled',
      canceledAt: new Date(),
      canceledBy: currentUser.id
    })
    .where(eq(lessonBookings.id, bookingId))

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

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

export const cancelLesson: AppRouteHandler<CancelLessonRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  ensureAdmin(c)

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  await db.update(lessons)
    .set({ status: 'canceled' })
    .where(eq(lessons.id, lessonId))

  const bookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lessonId),
        operators.eq(fields.status, 'booked')
      )
    }
  })

  for (const booking of bookings) {
    await db.update(lessonBookings)
      .set({
        status: 'admin_canceled',
        canceledAt: new Date(),
        canceledBy: 'admin'
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
        lessonId: lesson.id,
        delta: 1,
        reason: 'lesson_cancel_admin'
      })
    }
  }

  return c.json({ message: 'Lesson canceled' }, HttpStatusCodes.OK)
}

export const confirmLessonTutor: AppRouteHandler<ConfirmLessonTutorRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'tutor') {
    forbid()
  }

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  if (lesson.tutorId !== currentUser.id) {
    forbid()
  }

  if (!canConfirmLesson(lesson)) {
    return c.json({ message: HttpStatusPhrases.BAD_REQUEST }, HttpStatusCodes.BAD_REQUEST)
  }

  const bookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lessonId),
        operators.eq(fields.status, 'booked')
      )
    },
    columns: { studentConfirmed: true }
  })

  const currentStatus = await autoStallLessonIfNeeded(lesson, bookings)
  if (currentStatus === 'stalled' || currentStatus === 'canceled' || currentStatus === 'completed') {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  if (lesson.tutorConfirmed !== null && lesson.tutorConfirmed !== undefined) {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  const confirmedAt = new Date()
  await db.update(lessons)
    .set({
      tutorConfirmed: payload.completed,
      tutorConfirmedAt: confirmedAt,
      tutorConfirmationNote: payload.note ?? null
    })
    .where(eq(lessons.id, lessonId))

  let nextStatus = lesson.status
  const hasNegative = payload.completed === false
    || bookings.some(booking => booking.studentConfirmed === false)

  if (hasNegative) {
    nextStatus = 'stalled'
  }
  else if (lesson.status !== 'stalled' && bookings.every(booking => booking.studentConfirmed === true)) {
    nextStatus = 'completed'
  }

  if (nextStatus !== lesson.status) {
    await db.update(lessons)
      .set({ status: nextStatus })
      .where(eq(lessons.id, lessonId))
  }

  return c.json(
    {
      status: nextStatus,
      tutorConfirmed: payload.completed,
      tutorConfirmedAt: confirmedAt.toISOString()
    },
    HttpStatusCodes.OK
  )
}

export const confirmLessonBooking: AppRouteHandler<ConfirmLessonBookingRoute> = async (c) => {
  const { lessonId, bookingId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'student') {
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
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  if (booking.studentId !== currentUser.id) {
    forbid()
  }

  if (booking.status !== 'booked') {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  if (booking.studentConfirmed !== null && booking.studentConfirmed !== undefined) {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  if (!canConfirmLesson(lesson)) {
    return c.json({ message: HttpStatusPhrases.BAD_REQUEST }, HttpStatusCodes.BAD_REQUEST)
  }

  const bookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lessonId),
        operators.eq(fields.status, 'booked')
      )
    },
    columns: { studentConfirmed: true }
  })

  const currentStatus = await autoStallLessonIfNeeded(lesson, bookings)
  if (currentStatus === 'stalled' || currentStatus === 'canceled' || currentStatus === 'completed') {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  const confirmedAt = new Date()
  await db.update(lessonBookings)
    .set({
      studentConfirmed: payload.completed,
      studentConfirmedAt: confirmedAt,
      studentConfirmationNote: payload.note ?? null
    })
    .where(eq(lessonBookings.id, bookingId))

  let nextStatus = lesson.status
  const hasNegative = payload.completed === false
    || lesson.tutorConfirmed === false
    || bookings.some(row => row.studentConfirmed === false)

  if (hasNegative) {
    nextStatus = 'stalled'
  }
  else if (lesson.status !== 'stalled'
    && lesson.tutorConfirmed === true
    && bookings.every(row => row.studentConfirmed === true)) {
    nextStatus = 'completed'
  }

  if (nextStatus !== lesson.status) {
    await db.update(lessons)
      .set({ status: nextStatus })
      .where(eq(lessons.id, lessonId))
  }

  return c.json(
    {
      lesson: {
        status: nextStatus,
        tutorConfirmed: lesson.tutorConfirmed == null ? null : Boolean(lesson.tutorConfirmed),
        tutorConfirmedAt: lesson.tutorConfirmedAt
          ? new Date(lesson.tutorConfirmedAt).toISOString()
          : null
      },
      booking: {
        status: booking.status,
        studentConfirmed: payload.completed,
        studentConfirmedAt: confirmedAt.toISOString()
      }
    },
    HttpStatusCodes.OK
  )
}

export const listLessonConfirmations: AppRouteHandler<ListLessonConfirmationsRoute> = async (c) => {
  ensureAdmin(c)
  const { state } = c.req.valid('query')

  const lessonsRows = await db.query.lessons.findMany({
    where(fields, operators) {
      return operators.eq(fields.status, state === 'stalled' ? 'stalled' : 'scheduled')
    },
    columns: {
      id: true,
      tutorId: true,
      subjectId: true,
      startAt: true,
      durationMinutes: true,
      status: true,
      tutorConfirmed: true
    }
  })

  // Pending confirmations are only visible after the scheduled end window.
  const eligibleLessons = state === 'pending'
    ? lessonsRows.filter(lesson => canConfirmLesson(lesson))
    : lessonsRows

  if (eligibleLessons.length === 0) {
    return c.json([], HttpStatusCodes.OK)
  }

  const lessonIds = eligibleLessons.map(lesson => lesson.id)
  const bookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.inArray(fields.lessonId, lessonIds),
        operators.eq(fields.status, 'booked')
      )
    },
    columns: {
      lessonId: true,
      studentConfirmed: true
    }
  })

  const bookingMap = new Map<string, Array<{ studentConfirmed: boolean | null }>>()
  for (const booking of bookings) {
    const list = bookingMap.get(booking.lessonId) ?? []
    list.push({ studentConfirmed: booking.studentConfirmed ?? null })
    bookingMap.set(booking.lessonId, list)
  }

  const items = []
  for (const lesson of eligibleLessons) {
    const lessonBookings = bookingMap.get(lesson.id) ?? []
    if (lessonBookings.length === 0) {
      continue
    }

    let status = lesson.status
    if (state === 'pending') {
      // Auto-stall overdue lessons with missing confirmations.
      status = await autoStallLessonIfNeeded(lesson, lessonBookings)
      if (status === 'stalled') {
        continue
      }
    }

    const confirmedCount = lessonBookings.filter(booking => booking.studentConfirmed === true).length
    const bookedCount = lessonBookings.length
    const tutorConfirmed = lesson.tutorConfirmed == null ? null : Boolean(lesson.tutorConfirmed)

    if (state === 'pending' && tutorConfirmed === true && confirmedCount === bookedCount) {
      continue
    }

    items.push({
      id: lesson.id,
      tutorId: lesson.tutorId,
      subjectId: lesson.subjectId,
      startAt: new Date(lesson.startAt).toISOString(),
      durationMinutes: lesson.durationMinutes,
      status,
      tutorConfirmed,
      bookedCount,
      confirmedCount
    })
  }

  return c.json(items, HttpStatusCodes.OK)
}

export const getLessonConfirmations: AppRouteHandler<GetLessonConfirmationsRoute> = async (c) => {
  ensureAdmin(c)
  const { lessonId } = c.req.valid('param')

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const bookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.eq(fields.lessonId, lessonId)
    },
    columns: {
      id: true,
      studentId: true,
      status: true,
      studentConfirmed: true,
      studentConfirmedAt: true,
      studentConfirmationNote: true
    }
  })

  return c.json(
    {
      lesson: {
        id: lesson.id,
        tutorId: lesson.tutorId,
        subjectId: lesson.subjectId,
        startAt: new Date(lesson.startAt).toISOString(),
        durationMinutes: lesson.durationMinutes,
        status: lesson.status,
        tutorConfirmed: lesson.tutorConfirmed == null ? null : Boolean(lesson.tutorConfirmed),
        tutorConfirmedAt: lesson.tutorConfirmedAt
          ? new Date(lesson.tutorConfirmedAt).toISOString()
          : null,
        tutorConfirmationNote: lesson.tutorConfirmationNote ?? null
      },
      bookings: bookings.map(booking => ({
        id: booking.id,
        studentId: booking.studentId,
        status: booking.status,
        studentConfirmed: booking.studentConfirmed == null ? null : Boolean(booking.studentConfirmed),
        studentConfirmedAt: booking.studentConfirmedAt
          ? new Date(booking.studentConfirmedAt).toISOString()
          : null,
        studentConfirmationNote: booking.studentConfirmationNote ?? null
      }))
    },
    HttpStatusCodes.OK
  )
}

export const resolveLesson: AppRouteHandler<ResolveLessonRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json')
  const admin = ensureAdmin(c)

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  if (lesson.status === 'completed' || lesson.status === 'canceled') {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  if (lesson.status !== 'stalled') {
    return c.json({ message: HttpStatusPhrases.BAD_REQUEST }, HttpStatusCodes.BAD_REQUEST)
  }

  const resolvedAt = new Date()
  // Admins finalize stalled lessons as completed or canceled.
  if (payload.action === 'complete') {
    await db.update(lessons)
      .set({
        status: 'completed',
        adminResolvedAt: resolvedAt,
        adminResolvedBy: admin.id,
        adminResolutionNote: payload.note ?? null
      })
      .where(eq(lessons.id, lessonId))

    await db.update(lessonBookings)
      .set({ status: 'completed' })
      .where(eq(lessonBookings.lessonId, lessonId))

    return c.json({ message: 'Lesson resolved' }, HttpStatusCodes.OK)
  }

  await db.update(lessons)
    .set({
      status: 'canceled',
      adminResolvedAt: resolvedAt,
      adminResolvedBy: admin.id,
      adminResolutionNote: payload.note ?? null
    })
    .where(eq(lessons.id, lessonId))

  const bookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lessonId),
        operators.eq(fields.status, 'booked')
      )
    }
  })

  for (const booking of bookings) {
    await db.update(lessonBookings)
      .set({
        status: 'admin_canceled',
        canceledAt: new Date(),
        canceledBy: admin.id
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

  return c.json({ message: 'Lesson resolved' }, HttpStatusCodes.OK)
}

export const rescheduleLesson: AppRouteHandler<RescheduleLessonRoute> = async (c) => {
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json')
  ensureAdmin(c)

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  if (lesson.status === 'completed' || lesson.status === 'canceled') {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  const availability = await db.query.tutorAvailability.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, payload.availabilityId)
    }
  })

  if (!availability) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const subjectAllowed = await isSubjectAllowed(availability.tutorId, lesson.subjectId)
  if (!subjectAllowed) {
    return c.json({ message: HttpStatusPhrases.BAD_REQUEST }, HttpStatusCodes.BAD_REQUEST)
  }

  const newStartAt = new Date(availability.startAt)
  if (sameDayOrAfter(new Date(), newStartAt)) {
    return c.json({ message: HttpStatusPhrases.BAD_REQUEST }, HttpStatusCodes.BAD_REQUEST)
  }

  const slotLesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.availabilityId, availability.id)
    },
    columns: { id: true }
  })

  if (slotLesson && slotLesson.id !== lesson.id) {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  const bookingCount = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lesson.id),
        operators.eq(fields.status, 'booked')
      )
    },
    columns: { id: true }
  })

  if (bookingCount.length > availability.seats) {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  await db.update(lessons)
    .set({
      tutorId: availability.tutorId,
      availabilityId: availability.id,
      startAt: newStartAt,
      durationMinutes: availability.durationMinutes,
      seats: availability.seats,
      status: 'scheduled',
      tutorConfirmed: null,
      tutorConfirmedAt: null,
      tutorConfirmationNote: payload.note ?? null
    })
    .where(eq(lessons.id, lesson.id))

  await db.update(lessonBookings)
    .set({
      studentConfirmed: null,
      studentConfirmedAt: null,
      studentConfirmationNote: null
    })
    .where(eq(lessonBookings.lessonId, lesson.id))

  return c.json({ message: 'Lesson rescheduled' }, HttpStatusCodes.OK)
}

export const overrideLessonConfirmations: AppRouteHandler<OverrideLessonConfirmationsRoute> = async (c) => {
  ensureAdmin(c)
  const { lessonId } = c.req.valid('param')
  const payload = c.req.valid('json')

  const lesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  if (!lesson) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  if (lesson.status === 'completed' || lesson.status === 'canceled') {
    return c.json({ message: HttpStatusPhrases.CONFLICT }, HttpStatusCodes.CONFLICT)
  }

  if (payload.tutorConfirmed !== undefined || payload.tutorNote !== undefined) {
    await db.update(lessons)
      .set({
        tutorConfirmed: payload.tutorConfirmed ?? lesson.tutorConfirmed,
        tutorConfirmedAt: payload.tutorConfirmed !== undefined ? new Date() : lesson.tutorConfirmedAt,
        tutorConfirmationNote: payload.tutorNote ?? lesson.tutorConfirmationNote
      })
      .where(eq(lessons.id, lessonId))
  }

  if (payload.bookings && payload.bookings.length > 0) {
    for (const booking of payload.bookings) {
      await db.update(lessonBookings)
        .set({
          studentConfirmed: booking.completed,
          studentConfirmedAt: new Date(),
          studentConfirmationNote: booking.note ?? null
        })
        .where(eq(lessonBookings.id, booking.bookingId))
    }
  }

  const updatedLesson = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, lessonId)
    }
  })

  const updatedBookings = await db.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.eq(fields.lessonId, lessonId)
    }
  })

  const hasNegative = updatedLesson?.tutorConfirmed === false
    || updatedBookings.some(booking => booking.studentConfirmed === false)

  let nextStatus = updatedLesson?.status ?? lesson.status
  if (hasNegative) {
    nextStatus = 'stalled'
  }
  else if (updatedLesson?.tutorConfirmed === true
    && updatedBookings.length > 0
    && updatedBookings.every(booking => booking.studentConfirmed === true)) {
    nextStatus = 'completed'
  }

  if (updatedLesson && nextStatus !== updatedLesson.status) {
    await db.update(lessons)
      .set({ status: nextStatus })
      .where(eq(lessons.id, lessonId))
  }

  const resultSource = updatedLesson ?? lesson
  const resultLesson = {
    id: resultSource.id,
    tutorId: resultSource.tutorId,
    subjectId: resultSource.subjectId,
    startAt: new Date(resultSource.startAt).toISOString(),
    durationMinutes: resultSource.durationMinutes,
    status: nextStatus,
    tutorConfirmed: resultSource.tutorConfirmed == null ? null : Boolean(resultSource.tutorConfirmed),
    tutorConfirmedAt: resultSource.tutorConfirmedAt
      ? new Date(resultSource.tutorConfirmedAt).toISOString()
      : null,
    tutorConfirmationNote: resultSource.tutorConfirmationNote ?? null
  }

  return c.json(
    {
      lesson: resultLesson,
      bookings: updatedBookings.map(booking => ({
        id: booking.id,
        studentId: booking.studentId,
        status: booking.status,
        studentConfirmed: booking.studentConfirmed == null ? null : Boolean(booking.studentConfirmed),
        studentConfirmedAt: booking.studentConfirmedAt
          ? new Date(booking.studentConfirmedAt).toISOString()
          : null,
        studentConfirmationNote: booking.studentConfirmationNote ?? null
      }))
    },
    HttpStatusCodes.OK
  )
}
