// Purpose: Who still owes feedback for today's lessons that have already started.
import { and, gte, inArray, isNull, lt } from 'drizzle-orm'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { schoolDayRange } from '@/lib/school-time'

export interface PendingFeedback { role: 'student' | 'tutor', count: number }

// For each user, how many of today's confirmed bookings still lack their feedback.
export async function pendingFeedback(now: Date) {
  const { start, end } = schoolDayRange(now)
  const upperBound = now < end ? now : end

  const todayLessons = await db
    .select({
      id: lessons.id,
      tutorId: lessons.tutorId,
      startAt: lessons.startAt
    })
    .from(lessons)
    .where(and(
      gte(lessons.startAt, start),
      lt(lessons.startAt, upperBound)
    ))

  if (todayLessons.length === 0) {
    return new Map<string, PendingFeedback>()
  }

  const lessonById = new Map(todayLessons.map(lesson => [lesson.id, lesson]))
  const lessonIds = todayLessons.map(lesson => lesson.id)

  const bookings = await db
    .select({
      id: lessonBookings.id,
      lessonId: lessonBookings.lessonId,
      studentId: lessonBookings.studentId,
      status: lessonBookings.status
    })
    .from(lessonBookings)
    .where(inArray(lessonBookings.lessonId, lessonIds))

  const confirmedBookings = bookings.filter(booking => booking.status === 'confirmed')

  if (confirmedBookings.length === 0) {
    return new Map<string, PendingFeedback>()
  }

  const bookingIds = confirmedBookings.map(booking => booking.id)

  const feedbackRows = await db
    .select({
      bookingId: lessonFeedback.bookingId,
      authorUserId: lessonFeedback.authorUserId,
      authorRole: lessonFeedback.authorRole
    })
    .from(lessonFeedback)
    // A feedback an admin deleted is missing again: its author may write a new one.
    .where(and(inArray(lessonFeedback.bookingId, bookingIds), isNull(lessonFeedback.deletedAt)))

  const feedbackByBooking = new Map<string, { student: boolean, tutor: boolean }>()

  for (const row of feedbackRows) {
    const entry = feedbackByBooking.get(row.bookingId) ?? { student: false, tutor: false }
    if (row.authorRole === 'student') {
      entry.student = true
    }
    if (row.authorRole === 'tutor') {
      entry.tutor = true
    }
    feedbackByBooking.set(row.bookingId, entry)
  }

  const pendingByUser = new Map<string, PendingFeedback>()

  for (const booking of confirmedBookings) {
    const lesson = lessonById.get(booking.lessonId)
    if (!lesson) {
      continue
    }

    const flags = feedbackByBooking.get(booking.id) ?? { student: false, tutor: false }

    if (!flags.student) {
      const entry = pendingByUser.get(booking.studentId)
      if (entry) {
        entry.count += 1
      }
      else {
        pendingByUser.set(booking.studentId, { role: 'student', count: 1 })
      }
    }

    if (!flags.tutor) {
      const entry = pendingByUser.get(lesson.tutorId)
      if (entry) {
        entry.count += 1
      }
      else {
        pendingByUser.set(lesson.tutorId, { role: 'tutor', count: 1 })
      }
    }
  }
  return pendingByUser
}
