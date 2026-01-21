// Purpose: Activator seed script.
import db from '@/db'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { hashPassword } from '@/lib/password'

async function main() {
  if (!env.ACTIVATOR_EMAIL || !env.ACTIVATOR_PASSWORD) {
    throw new Error('ACTIVATOR_EMAIL and ACTIVATOR_PASSWORD must be set to seed an activator user')
  }

  const existing = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, env.ACTIVATOR_EMAIL!)
    }
  })

  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Activator user already exists with email ${env.ACTIVATOR_EMAIL}`)
    return
  }

  const passwordHash = await hashPassword(env.ACTIVATOR_PASSWORD)

  await db.insert(users).values({
    email: env.ACTIVATOR_EMAIL,
    firstName: env.ACTIVATOR_FIRST_NAME,
    lastName: env.ACTIVATOR_LAST_NAME,
    role: 'activator',
    passwordHash,
    emailVerifiedAt: new Date()
  })

  await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, env.ACTIVATOR_EMAIL!)
    },
    columns: { id: true }
  })

  // eslint-disable-next-line no-console
  console.log(`Seeded activator user ${env.ACTIVATOR_EMAIL}`)
}

main()
  .catch((error) => {
    console.error('Failed to seed activator user')

    console.error(error)
    process.exitCode = 1
  })
