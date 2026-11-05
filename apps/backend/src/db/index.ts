// Purpose: Drizzle database client setup.
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import env from '@/env'

import { adminInviteTokens } from './schemas/admin-invite-tokens.schema'
import { adminProfiles } from './schemas/admin-profiles.schema'
import { auditLogs } from './schemas/audit-logs.schema'
import { classSections } from './schemas/class-sections.schema'
import { emailVerificationTokens } from './schemas/email-verification-tokens.schema'
import { globalSettings } from './schemas/global-settings.schema'
import { lessonBookings } from './schemas/lesson-bookings.schema'
import { lessonFeedback } from './schemas/lesson-feedback.schema'
import { lessons } from './schemas/lessons.schema'
import { passwordResetTokens } from './schemas/password-reset-tokens.schema'
import { refreshTokens } from './schemas/refresh-tokens.schema'
import { studentProfiles } from './schemas/student-profiles.schema'
import { subjectRequests } from './schemas/subject-requests.schema'
import { subjects } from './schemas/subjects.schema'
import { tokenLedger } from './schemas/token-ledger.schema'
import { tutorInviteTokens } from './schemas/tutor-invite-tokens.schema'
import { tutorProfiles } from './schemas/tutor-profiles.schema'
import { tutorSettings } from './schemas/tutor-settings.schema'
import { tutorSubjects } from './schemas/tutor-subjects.schema'
import { tutorWeekdayAvailability } from './schemas/tutor-weekday-availability.schema'
import { users } from './schemas/users.schema'

const schema = {
  users,
  auditLogs,
  adminInviteTokens,
  adminProfiles,
  classSections,
  globalSettings,
  studentProfiles,
  tutorProfiles,
  subjects,
  subjectRequests,
  tutorSubjects,
  tutorSettings,
  tutorWeekdayAvailability,
  tutorInviteTokens,
  lessons,
  lessonBookings,
  lessonFeedback,
  tokenLedger,
  refreshTokens,
  emailVerificationTokens,
  passwordResetTokens
}

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // A stuck database must fail requests, not hold them open forever.
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000
})

pool.on('error', (error) => {
  // Prevent unhandled pool errors from crashing the process.
  console.error('Postgres pool error', error)
})

const db = drizzle(pool, {
  casing: 'snake_case',
  schema
})

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export function closeDb() {
  return pool.end()
}

export default db
