// Purpose: Delete data that is no longer needed: old audit logs, expired tokens and push
// subscriptions of devices that have been silent for months, who closed long-expired popups,
// notifications older than the panel keeps, usage counts older than 13 months, and lessons
// nobody booked once their bookings have closed.
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import { and, inArray, isNotNull, lt, notExists, sql } from 'drizzle-orm'

import db from '@/db'
import { adminInviteTokens } from '@/db/schemas/admin-invite-tokens.schema'
import { announcementDismissals, announcements } from '@/db/schemas/announcements.schema'
import { auditLogs } from '@/db/schemas/audit-logs.schema'
import { emailVerificationTokens } from '@/db/schemas/email-verification-tokens.schema'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { notifications } from '@/db/schemas/notifications.schema'
import { passwordResetTokens } from '@/db/schemas/password-reset-tokens.schema'
import { refreshTokens } from '@/db/schemas/refresh-tokens.schema'
import { tutorInviteTokens } from '@/db/schemas/tutor-invite-tokens.schema'
import { deleteOldAnalytics, rollUpActiveUsers } from '@/lib/analytics'
import { KEEP_NOTIFICATIONS_DAYS } from '@/lib/notification-inbox'
import { deleteStaleSubscriptions } from '@/lib/push'
import { addDays, schoolDayKey, schoolTime } from '@/lib/school-time'

export const AUDIT_LOG_RETENTION_DAYS = 90
// Long enough that an admin who extends a popup just after it expired keeps who closed it.
export const EXPIRED_POPUP_DISMISSALS_DAYS = 30
const BATCH_SIZE = 5_000

// Small batches keep the first run, on a table that has never been cleaned, from holding
// locks and blocking the audit rows written by every request.
async function deleteOlderThan(table: PgTable, id: PgColumn, date: PgColumn, cutoff: Date) {
  let total = 0
  for (;;) {
    const batch = db.select({ id }).from(table).where(lt(date, cutoff)).limit(BATCH_SIZE)
    const result = await db.delete(table).where(inArray(id, batch))
    const deleted = result.rowCount ?? 0
    total += deleted
    if (deleted < BATCH_SIZE) {
      return total
    }
  }
}

// Popups without an expiry keep their dismissals: they can be shown again at any time.
async function deleteExpiredPopupDismissals(now: Date) {
  const cutoff = new Date(now.getTime() - EXPIRED_POPUP_DISMISSALS_DAYS * 24 * 60 * 60 * 1000)
  const expired = db.select({ id: announcements.id })
    .from(announcements)
    .where(and(isNotNull(announcements.expiresAt), lt(announcements.expiresAt, cutoff)))
  const result = await db.delete(announcementDismissals).where(inArray(announcementDismissals.announcementId, expired))
  return result.rowCount ?? 0
}

// Bookings close at 20:00 the day before a lesson: the first day a student can still book.
export function firstBookableDay(now: Date) {
  const today = schoolDayKey(now)
  return schoolTime(addDays(today, now >= schoolTime(today, 20)
    ? 2
    : 1))
}

// A lesson that never had a booking, not even one later canceled, has nothing worth keeping
// once bookings for it have closed. Lessons with canceled bookings stay for the year report.
export async function deleteUnbookedLessons(now: Date) {
  const result = await db.delete(lessons).where(and(
    lt(lessons.startAt, firstBookableDay(now)),
    notExists(db.select({ one: sql`1` }).from(lessonBookings).where(sql`${lessonBookings.lessonId} = ${lessons.id}`))
  ))
  return result.rowCount ?? 0
}

export async function cleanUpExpiredData(now = new Date()) {
  const auditCutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const notificationsCutoff = new Date(now.getTime() - KEEP_NOTIFICATIONS_DAYS * 24 * 60 * 60 * 1000)

  // Before the audit log loses its oldest day: active users are counted from it.
  const activeUserRows = await rollUpActiveUsers(now, AUDIT_LOG_RETENTION_DAYS)

  return {
    analyticsActiveUserRows: activeUserRows,
    analytics: await deleteOldAnalytics(now),
    auditLogs: await deleteOlderThan(auditLogs, auditLogs.id, auditLogs.createdAt, auditCutoff),
    refreshTokens: await deleteOlderThan(refreshTokens, refreshTokens.id, refreshTokens.expiresAt, now),
    emailVerificationTokens: await deleteOlderThan(emailVerificationTokens, emailVerificationTokens.id, emailVerificationTokens.expiresAt, now),
    passwordResetTokens: await deleteOlderThan(passwordResetTokens, passwordResetTokens.id, passwordResetTokens.expiresAt, now),
    adminInviteTokens: await deleteOlderThan(adminInviteTokens, adminInviteTokens.id, adminInviteTokens.expiresAt, now),
    tutorInviteTokens: await deleteOlderThan(tutorInviteTokens, tutorInviteTokens.id, tutorInviteTokens.expiresAt, now),
    pushSubscriptions: await deleteStaleSubscriptions(now),
    announcementDismissals: await deleteExpiredPopupDismissals(now),
    notifications: await deleteOlderThan(notifications, notifications.id, notifications.createdAt, notificationsCutoff),
    unbookedLessons: await deleteUnbookedLessons(now)
  }
}
