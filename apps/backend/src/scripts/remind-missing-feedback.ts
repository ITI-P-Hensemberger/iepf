// Purpose: Send reminder emails for missing lesson feedback on the current day.
import { inArray } from 'drizzle-orm'

import db, { closeDb } from '@/db'
import { users } from '@/db/schemas/users.schema'
import { buildLessonFeedbackReminderMessage } from '@/lib/email-templates'
import { pendingFeedback } from '@/lib/feedback-reminders'
import { createMailBatch } from '@/lib/mail-batch'
import { closeMailer } from '@/lib/mailer'
import { feedbackReminderPush } from '@/lib/push-messages'
import { createPushBatch, pruneReminderDeliveries, sendReminderOnce, sendReminderPushOnce } from '@/lib/reminder-delivery'
import { schoolDayKey } from '@/lib/school-time'

async function remindMissingFeedback() {
  const now = new Date()
  const pendingByUser = await pendingFeedback(now)

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

  await pruneReminderDeliveries()
  const mailBatch = createMailBatch()
  const pushBatch = createPushBatch()
  let sent = 0

  for (const [userId, pending] of pendingByUser.entries()) {
    const recipient = recipientById.get(userId)
    if (!recipient?.email) {
      continue
    }

    const message = buildLessonFeedbackReminderMessage(pending.role, pending.count)
    if (await sendReminderOnce(mailBatch, `feedback:${schoolDayKey(now)}:${userId}`, {
      to: recipient.email,
      subject: message.subject,
      text: message.text,
      html: message.html
    })) {
      sent += 1
    }
    await sendReminderPushOnce(pushBatch, `feedback:${schoolDayKey(now)}:${userId}`, userId, 'feedback', feedbackReminderPush(pending.role, pending.count))
  }

  const pushed = await pushBatch.finish()
  await mailBatch.finish()
  console.warn(`Sent ${sent} feedback reminder(s); ${pushed.delivered} push(es) delivered, ${pushed.failed} failed.`)
}

remindMissingFeedback()
  .catch((error) => {
    console.error('Failed to send feedback reminders:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    closeMailer()
    await closeDb()
  })
