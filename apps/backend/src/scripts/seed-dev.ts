// Purpose: Seed only the managed local development database, without sending emails.
import { closeDb } from '@/db'
import { DEV_PASSWORD, DEV_ROLES, seedDevelopmentData } from '@/lib/dev-seed'

try {
  await seedDevelopmentData()
  process.stdout.write(`Demo accounts: ${DEV_ROLES.map(role => `${role}@example.test`).join(', ')}\nPassword: ${DEV_PASSWORD}\n`)
}
catch (error) {
  console.error('Dev seed failed.', error)
  process.exitCode = 1
}
finally {
  await closeDb()
}
