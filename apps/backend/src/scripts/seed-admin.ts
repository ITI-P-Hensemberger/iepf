import db from '@/db'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { hashPassword } from '@/lib/password'

async function main() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed an admin user')
  }

  const existing = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, env.ADMIN_EMAIL!)
    }
  })

  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Admin user already exists with email ${env.ADMIN_EMAIL}`)
    return
  }

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD)

  await db.insert(users).values({
    email: env.ADMIN_EMAIL,
    firstName: env.ADMIN_FIRST_NAME,
    lastName: env.ADMIN_LAST_NAME,
    role: 'admin',
    passwordHash
  })

  // eslint-disable-next-line no-console
  console.log(`Seeded admin user ${env.ADMIN_EMAIL}`)
}

main()
  .catch((error) => {
    console.error('Failed to seed admin user')

    console.error(error)
    process.exitCode = 1
  })
