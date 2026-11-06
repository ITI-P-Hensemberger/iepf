// Purpose: Which kinds of notification a user wants, per channel. A missing row means all.
import { boolean, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { users } from './users.schema'

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid().primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  // Push, students and tutors.
  bookings: boolean().notNull().default(true),
  reminders: boolean().notNull().default(true),
  feedback: boolean().notNull().default(true),
  account: boolean().notNull().default(true),
  lessons: boolean().notNull().default(true),
  // Push, admins.
  adminLowFeedback: boolean().notNull().default(true),
  adminLateCancellations: boolean().notNull().default(true),
  adminAbsences: boolean().notNull().default(true),
  adminEmptyWeek: boolean().notNull().default(true),
  adminPendingAdmins: boolean().notNull().default(true),
  adminSubjectRequests: boolean().notNull().default(true),
  // Email, admins: the same kinds, chosen apart from push.
  emailAdminLowFeedback: boolean().notNull().default(true),
  emailAdminLateCancellations: boolean().notNull().default(true),
  emailAdminAbsences: boolean().notNull().default(true),
  emailAdminEmptyWeek: boolean().notNull().default(true),
  emailAdminPendingAdmins: boolean().notNull().default(true),
  emailAdminSubjectRequests: boolean().notNull().default(true),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})
