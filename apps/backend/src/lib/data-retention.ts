// Purpose: Delete data that is no longer needed: old audit logs, expired tokens and push
// subscriptions of devices that have been silent for months.
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import { inArray, lt } from 'drizzle-orm'

import db from '@/db'
import { adminInviteTokens } from '@/db/schemas/admin-invite-tokens.schema'
import { auditLogs } from '@/db/schemas/audit-logs.schema'
import { emailVerificationTokens } from '@/db/schemas/email-verification-tokens.schema'
import { passwordResetTokens } from '@/db/schemas/password-reset-tokens.schema'
import { refreshTokens } from '@/db/schemas/refresh-tokens.schema'
import { tutorInviteTokens } from '@/db/schemas/tutor-invite-tokens.schema'
import { deleteStaleSubscriptions } from '@/lib/push'

export const AUDIT_LOG_RETENTION_DAYS = 90
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

export async function cleanUpExpiredData(now = new Date()) {
  const auditCutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  return {
    auditLogs: await deleteOlderThan(auditLogs, auditLogs.id, auditLogs.createdAt, auditCutoff),
    refreshTokens: await deleteOlderThan(refreshTokens, refreshTokens.id, refreshTokens.expiresAt, now),
    emailVerificationTokens: await deleteOlderThan(emailVerificationTokens, emailVerificationTokens.id, emailVerificationTokens.expiresAt, now),
    passwordResetTokens: await deleteOlderThan(passwordResetTokens, passwordResetTokens.id, passwordResetTokens.expiresAt, now),
    adminInviteTokens: await deleteOlderThan(adminInviteTokens, adminInviteTokens.id, adminInviteTokens.expiresAt, now),
    tutorInviteTokens: await deleteOlderThan(tutorInviteTokens, tutorInviteTokens.id, tutorInviteTokens.expiresAt, now),
    pushSubscriptions: await deleteStaleSubscriptions(now)
  }
}
