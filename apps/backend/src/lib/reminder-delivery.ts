// Purpose: Send each reminder once, even if its job runs again.
import { eq, lt } from 'drizzle-orm'

import type { MailBatch } from '@/lib/mail-batch'
import type { MailPayload } from '@/lib/mailer'

import db from '@/db'
import { reminderDeliveries } from '@/db/schemas/reminder-deliveries.schema'

const KEEP_DELIVERIES_DAYS = 7

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
