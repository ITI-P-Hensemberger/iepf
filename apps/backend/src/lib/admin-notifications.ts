// Purpose: Notify every active admin, by push and by email, as each of them chose.
import { and, eq } from 'drizzle-orm'

import type { MailBatch } from '@/lib/mail-batch'
import type { AdminNoticeCategory, PushMessage } from '@/lib/push'
import type { PushBatch } from '@/lib/reminder-delivery'

import db from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { buildAbsenceAdminMessage, buildLateCancellationAdminMessage, buildLowFeedbackAdminMessage } from '@/lib/email-templates'
import { lessonContext } from '@/lib/lesson-context'
import { sendMail } from '@/lib/mailer'
import { emailPreference, notifyUsers, trackNotificationTask, usersWanting } from '@/lib/push'
import { absencePush, lateCancellationPush, lowFeedbackPush } from '@/lib/push-messages'
import { sendReminderOnce, sendReminderPushOnce } from '@/lib/reminder-delivery'

export interface AdminNotice {
  push: PushMessage
  email: { subject: string, text: string, html: string }
}

export async function activeAdmins() {
  return db.select({ id: users.id, email: users.email })
    .from(users)
    .innerJoin(adminProfiles, eq(adminProfiles.userId, users.id))
    .where(and(eq(users.role, 'admin'), eq(adminProfiles.isActive, true)))
}

async function emailRecipients(admins: Array<{ id: string, email: string }>, category: AdminNoticeCategory) {
  const wanted = new Set(await usersWanting(admins.map(admin => admin.id), emailPreference(category)))
  return admins.filter(admin => wanted.has(admin.id))
}

// For request handlers: never awaited and never throws, like the emails beside it.
export function notifyAdmins(category: AdminNoticeCategory, build: () => Promise<AdminNotice | null>) {
  trackNotificationTask((async () => {
    const notice = await build()
    if (!notice) {
      return
    }
    const admins = await activeAdmins()
    notifyUsers(admins.map(admin => admin.id), category, notice.push)
    for (const admin of await emailRecipients(admins, category)) {
      sendMail({ to: admin.email, ...notice.email })
        .catch(error => console.error(`Failed to send ${category} email:`, error))
    }
  })().catch(error => console.error(`Failed to notify admins (${category}):`, error)))
}

// For jobs: claimed per admin and channel, so a rerun sends neither twice.
export async function notifyAdminsOnce(batches: { mail: MailBatch, push: PushBatch }, key: string, category: AdminNoticeCategory, notice: AdminNotice) {
  const admins = await activeAdmins()
  for (const admin of await emailRecipients(admins, category)) {
    await sendReminderOnce(batches.mail, `${key}:${admin.id}`, { to: admin.email, ...notice.email })
  }
  for (const admin of admins) {
    await sendReminderPushOnce(batches.push, `${key}:${admin.id}`, admin.id, category, notice.push)
  }
  return admins.length
}

export const LOW_FEEDBACK_RATING = 2

export function notifyLowFeedback(params: { lessonId: string, studentId: string, authorRole: 'student' | 'tutor', rating: number }) {
  if (params.rating > LOW_FEEDBACK_RATING) {
    return
  }
  notifyAdmins('adminLowFeedback', async () => {
    const context = await lessonContext(params.lessonId, params.studentId)
    return context && {
      push: lowFeedbackPush({ authorRole: params.authorRole, rating: params.rating, subjectName: context.subjectName, startAt: context.lessonStartAt }),
      email: buildLowFeedbackAdminMessage({ ...context, authorRole: params.authorRole, rating: params.rating })
    }
  })
}

export function notifyLateCancellation(params: { lessonId: string, studentId: string }) {
  notifyAdmins('adminLateCancellations', async () => {
    const context = await lessonContext(params.lessonId, params.studentId)
    return context && {
      push: lateCancellationPush({ lessonId: context.lessonId, subjectName: context.subjectName, startAt: context.lessonStartAt }),
      email: buildLateCancellationAdminMessage(context)
    }
  })
}

export function notifyAbsence(params: { lessonId: string, studentId: string }) {
  notifyAdmins('adminAbsences', async () => {
    const context = await lessonContext(params.lessonId, params.studentId)
    return context && {
      push: absencePush({ lessonId: context.lessonId, subjectName: context.subjectName, startAt: context.lessonStartAt }),
      email: buildAbsenceAdminMessage(context)
    }
  })
}
