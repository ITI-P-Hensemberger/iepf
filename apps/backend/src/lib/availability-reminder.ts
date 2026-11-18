// Purpose: Friday at 20:00, remind active tutors to update their availability before Saturday's
// 12:00 generation of next week's lessons.
import { and, eq } from 'drizzle-orm'

import type { MailBatch } from '@/lib/mail-batch'
import type { PushBatch } from '@/lib/reminder-delivery'

import db from '@/db'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { buildAvailabilityReminderMessage } from '@/lib/email-templates'
import { getClosureDates, hasOpenSchoolDay } from '@/lib/empty-week'
import { availabilityReminderPush } from '@/lib/push-messages'
import { sendReminderOnce, sendReminderPushOnce } from '@/lib/reminder-delivery'
import { addDays, schoolDayKey, schoolTime, weekdayOf } from '@/lib/school-time'

// Each tutor once per week and channel. A week closed on every school day gets no lessons, so
// nothing to update.
export async function remindAvailability(batches: { mail: MailBatch, push: PushBatch }, now = new Date()) {
  const todayKey = schoolDayKey(now)
  const mondayKey = addDays(todayKey, 8 - weekdayOf(todayKey))
  const monday = schoolTime(mondayKey)
  if (!hasOpenSchoolDay(monday, new Set(await getClosureDates()))) {
    return 0
  }

  const tutors = await db.select({ id: users.id, email: users.email })
    .from(users)
    .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .where(and(eq(users.role, 'tutor'), eq(tutorProfiles.isActive, true)))

  const message = buildAvailabilityReminderMessage(monday)
  const push = availabilityReminderPush(monday)
  for (const tutor of tutors) {
    const key = `availability:${mondayKey}:${tutor.id}`
    await sendReminderOnce(batches.mail, key, { to: tutor.email, ...message })
    await sendReminderPushOnce(batches.push, key, tutor.id, 'reminders', push)
  }
  return tutors.length
}
