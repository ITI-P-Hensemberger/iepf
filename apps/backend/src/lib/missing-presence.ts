// Purpose: Remind the tutor, and tell the admins, when a lesson started 20 minutes ago and
// some of its students are still neither present nor absent.
import { and, eq, gte, isNull, lte } from 'drizzle-orm'

import type { MailBatch } from '@/lib/mail-batch'
import type { PushBatch } from '@/lib/reminder-delivery'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { users } from '@/db/schemas/users.schema'
import { notifyAdminsOnce } from '@/lib/admin-notifications'
import { buildMissingPresenceAdminMessage, buildMissingPresenceTutorMessage } from '@/lib/email-templates'
import { missingPresenceAdminPush, missingPresenceTutorPush } from '@/lib/push-messages'
import { sendReminderOnce, sendReminderPushOnce } from '@/lib/reminder-delivery'
import { schoolDayRange } from '@/lib/school-time'

export const MISSING_PRESENCE_MINUTES = 20

// Today's lessons that started at least 20 minutes ago with a confirmed booking still unmarked.
export async function lessonsMissingPresence(now: Date) {
  const { start } = schoolDayRange(now)
  const startedBefore = new Date(now.getTime() - MISSING_PRESENCE_MINUTES * 60 * 1000)
  return db.selectDistinct({
    lessonId: lessons.id,
    startAt: lessons.startAt,
    tutorId: users.id,
    tutorEmail: users.email,
    tutorName: users.firstName,
    tutorLastName: users.lastName,
    subjectName: subjects.name
  })
    .from(lessons)
    .innerJoin(lessonBookings, eq(lessonBookings.lessonId, lessons.id))
    .innerJoin(users, eq(users.id, lessons.tutorId))
    .innerJoin(subjects, eq(subjects.id, lessons.subjectId))
    .where(and(
      eq(lessons.status, 'confirmed'),
      gte(lessons.startAt, start),
      lte(lessons.startAt, startedBefore),
      eq(lessonBookings.status, 'confirmed'),
      isNull(lessonBookings.studentPresence)
    ))
}

// Each lesson once per channel and recipient: the job runs every few minutes.
export async function remindMissingPresence(batches: { mail: MailBatch, push: PushBatch }, now = new Date()) {
  const pending = await lessonsMissingPresence(now)
  for (const lesson of pending) {
    const facts = { lessonId: lesson.lessonId, subjectName: lesson.subjectName, startAt: lesson.startAt }
    const key = `missing-presence:${lesson.lessonId}`
    await sendReminderOnce(batches.mail, `${key}:tutor`, {
      to: lesson.tutorEmail,
      ...buildMissingPresenceTutorMessage({ ...facts, lessonStartAt: lesson.startAt })
    })
    await sendReminderPushOnce(batches.push, `${key}:tutor`, lesson.tutorId, 'updates', missingPresenceTutorPush(facts))
    await notifyAdminsOnce(batches, `${key}:admin`, 'adminMissingPresence', {
      push: missingPresenceAdminPush(facts),
      email: buildMissingPresenceAdminMessage({
        ...facts,
        lessonStartAt: lesson.startAt,
        tutorName: `${lesson.tutorName} ${lesson.tutorLastName}`.trim()
      })
    })
  }
  return pending.length
}
