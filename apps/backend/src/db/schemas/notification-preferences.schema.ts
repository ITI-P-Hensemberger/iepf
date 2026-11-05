// Purpose: Which kinds of push notification a user wants. A missing row means all of them.
import { boolean, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { users } from './users.schema'

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid().primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  bookings: boolean().notNull().default(true),
  reminders: boolean().notNull().default(true),
  feedback: boolean().notNull().default(true),
  account: boolean().notNull().default(true),
  lessons: boolean().notNull().default(true),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})
