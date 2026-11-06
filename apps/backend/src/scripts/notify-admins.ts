// Purpose: Daily job: tell admins about admins waiting for activation and new subject requests.
import { closeDb } from '@/db'
import { sendAdminDigest } from '@/lib/admin-digest'
import { createMailBatch } from '@/lib/mail-batch'
import { closeMailer } from '@/lib/mailer'
import { createPushBatch, pruneReminderDeliveries } from '@/lib/reminder-delivery'

async function main() {
  await pruneReminderDeliveries()
  const mail = createMailBatch()
  const push = createPushBatch()
  const found = await sendAdminDigest({ mail, push })
  const pushed = await push.finish()
  await mail.finish()
  process.stdout.write(`Admin digest: ${found.pendingAdmins} admin(s) waiting, ${found.subjectRequests} subject(s) requested; ${pushed.delivered} push(es) delivered, ${pushed.failed} failed\n`)
}

main()
  .catch((error) => {
    console.error('Failed to send the admin digest:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    closeMailer()
    await closeDb()
  })
