// Purpose: Browser push subscriptions, one per device a user enabled notifications on.
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Only 'webpush' today; a native app would add 'apns' or 'fcm' next to it.
  channel: text().notNull().default('webpush'),
  // Unique: a device stays subscribed after logout, and moves to whoever subscribes it next.
  endpoint: text().notNull().unique(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  // Renewed every time the device confirms the subscription.
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSuccessAt: timestamp({ mode: 'date', withTimezone: true })
}, table => [
  index('push_subscriptions_user_idx').on(table.userId)
])
