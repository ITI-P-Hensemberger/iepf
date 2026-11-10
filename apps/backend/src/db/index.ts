// Purpose: Drizzle database client setup.
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import env from '@/env'

import { activationEvents } from './schemas/activation-events.schema'
import { adminInviteTokens } from './schemas/admin-invite-tokens.schema'
import { adminProfiles } from './schemas/admin-profiles.schema'
import { analyticsDaily } from './schemas/analytics-daily.schema'
import { announcementDismissals, announcements } from './schemas/announcements.schema'
import { auditLogs } from './schemas/audit-logs.schema'
import { classSections } from './schemas/class-sections.schema'
import { emailVerificationTokens } from './schemas/email-verification-tokens.schema'
import { faqs } from './schemas/faqs.schema'
import { globalSettings } from './schemas/global-settings.schema'
import { lessonBookings } from './schemas/lesson-bookings.schema'
import { lessonChanges } from './schemas/lesson-changes.schema'
import { lessonFeedback, lessonFeedbackVersions } from './schemas/lesson-feedback.schema'
import { lessons } from './schemas/lessons.schema'
import { links } from './schemas/links.schema'
import { notificationPreferences } from './schemas/notification-preferences.schema'
import { notifications } from './schemas/notifications.schema'
import { passwordResetTokens } from './schemas/password-reset-tokens.schema'
import { pushSubscriptions } from './schemas/push-subscriptions.schema'
import { refreshTokens } from './schemas/refresh-tokens.schema'
import { reminderDeliveries } from './schemas/reminder-deliveries.schema'
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
  activationEvents,
  analyticsDaily,
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
  links,
  lessonBookings,
  lessonChanges,
  lessonFeedback,
  lessonFeedbackVersions,
  tokenLedger,
  refreshTokens,
  reminderDeliveries,
  emailVerificationTokens,
  passwordResetTokens,
  pushSubscriptions,
  notificationPreferences,
  notifications,
  announcements,
  announcementDismissals,
  faqs
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
