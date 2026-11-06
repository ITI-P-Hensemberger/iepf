// Purpose: Send each reminder once, even if its job runs again.
import { eq, lt } from 'drizzle-orm'

import type { MailBatch } from '@/lib/mail-batch'
import type { MailPayload } from '@/lib/mailer'
import type { PushCategory, PushMessage, PushResult } from '@/lib/push'

import db from '@/db'
import { reminderDeliveries } from '@/db/schemas/reminder-deliveries.schema'
import { recordNotifications } from '@/lib/notification-inbox'
import { deliverPush, isPushEnabled } from '@/lib/push'

export const KEEP_DELIVERIES_DAYS = 7

export function localDayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Claims the reminder before sending. A failed send gives the claim back, so that a rerun
// retries it; a crash between the two loses that email rather than sending it twice.
export async function sendReminderOnce(batch: MailBatch, key: string, payload: MailPayload) {
  const claimed = await db.insert(reminderDeliveries)
    .values({ key })
    .onConflictDoNothing()
    .returning({ key: reminderDeliveries.key })

  if (claimed.length === 0) {
    return false
  }

  batch.send(payload, async () => {
    await db.delete(reminderDeliveries).where(eq(reminderDeliveries.key, key))
  })
  return true
}

// Reminders concern today or tomorrow, so older records can never match again.
export async function pruneReminderDeliveries(now = new Date()) {
  const cutoff = new Date(now.getTime() - KEEP_DELIVERIES_DAYS * 24 * 60 * 60 * 1000)
  await db.delete(reminderDeliveries).where(lt(reminderDeliveries.createdAt, cutoff))
}

export type PushBatch = ReturnType<typeof createPushBatch>

// Unlike emails, a lost push does not fail the job: the email beside it is the record.
export function createPushBatch(deliver: typeof deliverPush = deliverPush) {
  const tasks: Array<Promise<PushResult>> = []
  return {
    send(userId: string, category: PushCategory, message: PushMessage, onFailed?: () => Promise<void>) {
      tasks.push(deliver([userId], category, message).then(async (result) => {
        if (result.failed > 0 && result.delivered === 0) {
          await onFailed?.().catch(error => console.error('Failed to undo push:', error))
        }
        return result
      }))
    },
    async finish() {
      const results = await Promise.all(tasks)
      return results.reduce((total, result) => ({
        delivered: total.delivered + result.delivered,
        failed: total.failed + result.failed
      }), { delivered: 0, failed: 0 })
    }
  }
}

async function claim(key: string) {
  const claimed = await db.insert(reminderDeliveries)
    .values({ key })
    .onConflictDoNothing()
    .returning({ key: reminderDeliveries.key })
  return claimed.length > 0
}

export async function recordNotificationOnce(key: string, userId: string, category: PushCategory, message: PushMessage) {
  if (!(await claim(key))) {
    return
  }
  if (!(await recordNotifications([userId], category, message))) {
    await db.delete(reminderDeliveries).where(eq(reminderDeliveries.key, key))
  }
}

// The same claim as sendReminderOnce, under its own key: email and push are retried apart.
// The panel entry has a claim of its own: a push retried by a rerun must not add it twice,
// and it is written even when push is off. Returns whether the push was sent.
export async function sendReminderPushOnce(batch: PushBatch, key: string, userId: string, category: PushCategory, message: PushMessage) {
  await recordNotificationOnce(`inbox:${key}`, userId, category, message)
  if (!isPushEnabled()) {
    return false
  }
  const pushKey = `push:${key}`
  if (!(await claim(pushKey))) {
    return false
  }

  batch.send(userId, category, message, async () => {
    await db.delete(reminderDeliveries).where(eq(reminderDeliveries.key, pushKey))
  })
  return true
}
