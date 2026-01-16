// Purpose: Drizzle database client setup.
import { drizzle } from 'drizzle-orm/libsql'

import env from '@/env'

import { adminProfiles } from './schemas/admin-profiles.schema'
import { auditLogs } from './schemas/audit-logs.schema'
import { classSections } from './schemas/class-sections.schema'
import { emailVerificationTokens } from './schemas/email-verification-tokens.schema'
import { lessonBookings } from './schemas/lesson-bookings.schema'
import { lessons } from './schemas/lessons.schema'
import { passwordResetTokens } from './schemas/password-reset-tokens.schema'
import { refreshTokens } from './schemas/refresh-tokens.schema'
import { studentProfiles } from './schemas/student-profiles.schema'
import { subjects } from './schemas/subjects.schema'
import { tokenLedger } from './schemas/token-ledger.schema'
import { tutorAvailability } from './schemas/tutor-availability.schema'
import { tutorProfiles } from './schemas/tutor-profiles.schema'
import { tutorSettings } from './schemas/tutor-settings.schema'
import { tutorSubjects } from './schemas/tutor-subjects.schema'
import { users } from './schemas/users.schema'

const schema = {
  users,
  auditLogs,
  adminProfiles,
  classSections,
  studentProfiles,
  tutorProfiles,
  subjects,
  tutorSubjects,
  tutorSettings,
  tutorAvailability,
  lessons,
  lessonBookings,
  tokenLedger,
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
