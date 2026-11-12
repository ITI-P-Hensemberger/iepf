// Purpose: The daily admin digest: admins waiting for activation and new subject requests.
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { MailBatch } from '@/lib/mail-batch'
import type { PushBatch } from '@/lib/reminder-delivery'

import db from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { subjectRequests } from '@/db/schemas/subject-requests.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { users } from '@/db/schemas/users.schema'
import { notifyAdminsOnce } from '@/lib/admin-notifications'
import { buildPendingAdminsMessage, buildSubjectRequestsAdminMessage } from '@/lib/email-templates'
import { pendingAdminsPush, subjectRequestsPush } from '@/lib/push-messages'
import { schoolDayKey } from '@/lib/school-time'

// Accepted the invite and never activated: an admin switched off by hand is not waiting.
export async function pendingAdmins() {
  return db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .innerJoin(adminProfiles, eq(adminProfiles.userId, users.id))
    .where(and(eq(users.role, 'admin'), eq(adminProfiles.isActive, false), isNull(adminProfiles.deactivatedAt)))
    .orderBy(users.createdAt)
}

// Requests of the last 24 hours, with each subject's running total.
export async function recentSubjectRequests() {
  const recent = await db.select({
    subjectId: subjectRequests.subjectId,
    subjectName: subjects.name,
    count: count()
  })
    .from(subjectRequests)
    .innerJoin(subjects, eq(subjects.id, subjectRequests.subjectId))
    .where(sql`${subjectRequests.createdAt} >= now() - interval '24 hours' and ${subjectRequests.createdAt} < now()`)
    .groupBy(subjectRequests.subjectId, subjects.name)
  if (recent.length === 0) {
    return []
  }
  const totals = await db.select({
    subjectId: subjectRequests.subjectId,
    total: count()
  })
    .from(subjectRequests)
    .where(inArray(subjectRequests.subjectId, recent.map(row => row.subjectId)))
    .groupBy(subjectRequests.subjectId)
  const totalBySubject = new Map(totals.map(row => [row.subjectId, row.total]))
  return recent
    .map(row => ({ subjectName: row.subjectName, count: row.count, total: totalBySubject.get(row.subjectId) ?? row.count }))
    .sort((a, b) => b.count - a.count || a.subjectName.localeCompare(b.subjectName))
}

export async function sendAdminDigest(batches: { mail: MailBatch, push: PushBatch }, now = new Date()) {
  const day = schoolDayKey(now)
  const waiting = await pendingAdmins()
  if (waiting.length > 0) {
    await notifyAdminsOnce(batches, `pending-admins:${day}`, 'adminPendingAdmins', {
      push: pendingAdminsPush(waiting.length),
      email: buildPendingAdminsMessage(waiting.map(admin => ({
        name: `${admin.firstName} ${admin.lastName}`.trim(),
        email: admin.email
      })))
    })
  }
  const requests = await recentSubjectRequests()
  if (requests.length > 0) {
    await notifyAdminsOnce(batches, `subject-requests:${day}`, 'adminSubjectRequests', {
      push: subjectRequestsPush(requests),
      email: buildSubjectRequestsAdminMessage(requests)
    })
  }
  return { pendingAdmins: waiting.length, subjectRequests: requests.length }
}
