// Purpose: Warn admins when the weekly generation leaves a school week without lessons.
import { and, count, gte, lt, ne } from 'drizzle-orm'

import type { MailBatch } from '@/lib/mail-batch'
import type { PushBatch } from '@/lib/reminder-delivery'

import db from '@/db'
import { lessons } from '@/db/schemas/lessons.schema'
import { notifyAdminsOnce } from '@/lib/admin-notifications'
import { buildEmptyWeekAdminMessage } from '@/lib/email-templates'
import { emptyWeekPush } from '@/lib/push-messages'
import { addDays, schoolDayKey, schoolTime } from '@/lib/school-time'

// Monday to Friday; closure days come from the admin settings as YYYY-MM-DD.
export function hasOpenSchoolDay(monday: Date, closureDates: Set<string>) {
  const mondayKey = schoolDayKey(monday)
  for (let offset = 0; offset < 5; offset++) {
    if (!closureDates.has(addDays(mondayKey, offset))) {
      return true
    }
  }
  return false
}

async function lessonsInWeek(monday: Date) {
  const end = schoolTime(addDays(schoolDayKey(monday), 7))
  const [row] = await db.select({ total: count() })
    .from(lessons)
    .where(and(gte(lessons.startAt, monday), lt(lessons.startAt, end), ne(lessons.status, 'canceled')))
  return row?.total ?? 0
}

// A week closed on every school day is expected to be empty and says nothing.
export async function notifyIfWeekEmpty(batches: { mail: MailBatch, push: PushBatch }, monday: Date, closureDates: Set<string>) {
  if (!hasOpenSchoolDay(monday, closureDates) || await lessonsInWeek(monday) > 0) {
    return false
  }
  await notifyAdminsOnce(batches, `empty-week:${schoolDayKey(monday)}`, 'adminEmptyWeek', {
    push: emptyWeekPush(monday),
    email: buildEmptyWeekAdminMessage(monday)
  })
  return true
}
