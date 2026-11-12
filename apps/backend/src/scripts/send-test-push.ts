// Purpose: Send a test notification to every device of one user, to check push end to end.
// Usage: pnpm run push:test -- nome.cognome@hensemberger.it
import db, { closeDb } from '@/db'
import { deliverPush, isPushEnabled } from '@/lib/push'

async function main() {
  const email = process.argv.slice(2).find(arg => arg !== '--')?.trim().toLowerCase()
  if (!email) {
    throw new Error('Pass the user email: pnpm run push:test -- user@example.test')
  }
  if (!isPushEnabled()) {
    throw new Error('Push is off: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT')
  }
  const user = await db.query.users.findFirst({
    where: (fields, operators) => operators.eq(fields.email, email),
    columns: { id: true }
  })
  if (!user) {
    throw new Error('No user with that email')
  }
  // 'account' is a kind every user can receive; a user who turned it off gets nothing.
  const result = await deliverPush([user.id], 'account', {
    title: 'Notifica di prova',
    body: 'Le notifiche di IEPF funzionano su questo dispositivo.',
    url: '/profile',
    tag: 'test'
  })
  process.stdout.write(`Delivered to ${result.delivered} device(s), ${result.failed} failed.\n`)
  if (result.delivered === 0) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error
      ? error.message
      : error)
    process.exitCode = 1
  })
  .finally(closeDb)
