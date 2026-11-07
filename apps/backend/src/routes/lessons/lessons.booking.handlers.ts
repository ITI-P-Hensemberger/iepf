// Purpose: Student bookings: book, cancel, presence, topic and whether a booking counts.

import { and, eq } from 'drizzle-orm'

import type { BookingOutcome } from '@/lib/analytics'
import type { AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { notifyAbsence, notifyLateCancellation } from '@/lib/admin-notifications'
import { countInBackground } from '@/lib/analytics'
import {
  buildLessonBookingCanceledMessage,
  buildLessonBookingConfirmedMessage,
  buildLessonPresenceUpdatedMessage
} from '@/lib/email-templates'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { getStudentTokenBalance, lockUsers } from '@/lib/lesson-tokens'
import { sendMail } from '@/lib/mailer'
import { containsProfanity } from '@/lib/profanity'
import { notifyUsers } from '@/lib/push'
import { bookingCanceledPush, bookingConfirmedPush } from '@/lib/push-messages'
import { bookingCutoff, isSameSchoolDay, schoolDayKey, schoolTime } from '@/lib/school-time'
import { tutorCanTeachStudent } from '@/lib/school-years'

import type {
  BookGeneratedLessonRoute,
  CancelBookingRoute,
  SetBookingPresenceRoute,
  UpdateBookingCountsRoute,
  UpdateBookingTopicRoute
} from './lessons.routes'

import {
  ensureAdmin,
  fetchLessonEmailDetails,
  fetchStudentsDetails,
  forbid,
  getStudentDailyBookingCount,
  getTutorDailyBookingCount,
  getTutorDailyCapacity,
  rejection,
  sameDayOrAfter
} from './lessons.shared'

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
