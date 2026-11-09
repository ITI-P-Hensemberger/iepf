// Purpose: Every few minutes: lessons started 20 minutes ago whose presence is not marked yet.
import { closeDb } from '@/db'
import { createMailBatch } from '@/lib/mail-batch'
import { closeMailer } from '@/lib/mailer'
import { remindMissingPresence } from '@/lib/missing-presence'
import { createPushBatch } from '@/lib/reminder-delivery'

async function main() {
  const mail = createMailBatch()
  const push = createPushBatch()
  const found = await remindMissingPresence({ mail, push })
  // Pushes first: a failed email batch throws, and the pushes already claimed must still go.
  const pushed = await push.finish()
  await mail.finish()
  process.stdout.write(`Missing presence: ${found} lesson(s); ${pushed.delivered} push(es) delivered, ${pushed.failed} failed\n`)
}

main()
  .catch((error) => {
    console.error('Failed to send missing presence reminders:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    closeMailer()
    await closeDb()
  })
