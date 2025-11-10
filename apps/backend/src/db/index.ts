import { drizzle } from 'drizzle-orm/libsql'

import env from '@/env'

import { users } from './schemas/users.schema'

const schema = {
  users
}

const db = drizzle({
  connection: {
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN
  },
  casing: 'snake_case',
  schema
})

export default db
