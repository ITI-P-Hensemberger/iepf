// Purpose: Drizzle database client setup.
import { drizzle } from 'drizzle-orm/libsql'

import env from '@/env'

import { emailVerificationTokens } from './schemas/email-verification-tokens.schema'
import { passwordResetTokens } from './schemas/password-reset-tokens.schema'
import { refreshTokens } from './schemas/refresh-tokens.schema'
import { subjects } from './schemas/subjects.schema'
import { tutorSubjects } from './schemas/tutor-subjects.schema'
import { users } from './schemas/users.schema'

const schema = {
  users,
  subjects,
  tutorSubjects,
  refreshTokens,
  emailVerificationTokens,
  passwordResetTokens
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
