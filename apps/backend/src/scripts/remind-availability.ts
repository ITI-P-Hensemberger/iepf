// Purpose: Friday at 20:00: remind tutors to update their availability before Saturday's generation.
import { closeDb } from '@/db'
import { remindAvailability } from '@/lib/availability-reminder'
import { createMailBatch } from '@/lib/mail-batch'
import { closeMailer } from '@/lib/mailer'
import { createPushBatch, pruneReminderDeliveries } from '@/lib/reminder-delivery'

async function main() {
  await pruneReminderDeliveries()
  const mail = createMailBatch()
  const push = createPushBatch()
  const tutors = await remindAvailability({ mail, push })
  // Pushes first: a failed email batch throws, and the pushes already claimed must still go.
  const pushed = await push.finish()
  await mail.finish()
  process.stdout.write(`Availability reminder: ${tutors} tutor(s); ${pushed.delivered} push(es) delivered, ${pushed.failed} failed\n`)
}

main()
  .catch((error) => {
    console.error('Failed to send availability reminders:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    closeMailer()
    await closeDb()
  })
