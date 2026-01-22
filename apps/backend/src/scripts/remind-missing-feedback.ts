// Purpose: Send reminder emails for missing lesson feedback on the current day.
import { and, gte, inArray, lte } from 'drizzle-orm'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { users } from '@/db/schemas/users.schema'
import { buildLessonFeedbackReminderMessage } from '@/lib/email-templates'
import { sendMail } from '@/lib/mailer'

function getDayBounds(reference = new Date()) {
  const start = new Date(reference)
  start.setHours(0, 0, 0, 0)
  const end = new Date(reference)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

async function remindMissingFeedback() {
  const now = new Date()
  const { start, end } = getDayBounds(now)
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
      lte(lessons.startAt, upperBound)
    ))

  if (todayLessons.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No lessons today. Skipping feedback reminders.')
    return
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
    // eslint-disable-next-line no-console
    console.log('No confirmed bookings for today. Skipping feedback reminders.')
    return
  }

  const bookingIds = confirmedBookings.map(booking => booking.id)

  const feedbackRows = await db
    .select({
      bookingId: lessonFeedback.bookingId,
      authorUserId: lessonFeedback.authorUserId,
      authorRole: lessonFeedback.authorRole
    })
    .from(lessonFeedback)
    .where(inArray(lessonFeedback.bookingId, bookingIds))

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

  const pendingByUser = new Map<string, { role: 'student' | 'tutor', count: number }>()

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

  if (pendingByUser.size === 0) {
    // eslint-disable-next-line no-console
    console.log('No pending feedback. Skipping feedback reminders.')
    return
  }

  const userIds = Array.from(pendingByUser.keys())
  const recipients = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName
    })
    .from(users)
    .where(inArray(users.id, userIds))

  const recipientById = new Map(recipients.map(recipient => [recipient.id, recipient]))

  for (const [userId, pending] of pendingByUser.entries()) {
    const recipient = recipientById.get(userId)
    if (!recipient?.email) {
      continue
    }

    const message = buildLessonFeedbackReminderMessage(pending.role, pending.count)
    await sendMail({
      to: recipient.email,
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  }

  console.warn(`Sent ${pendingByUser.size} feedback reminder(s).`)
}

remindMissingFeedback()
  .catch((error) => {
    console.error('Failed to send feedback reminders:', error)
    process.exitCode = 1
  })
