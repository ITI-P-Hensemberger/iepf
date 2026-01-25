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
  connectionString: env.DATABASE_URL
})

const db = drizzle(pool, {
  casing: 'snake_case',
  schema
})

export default db
