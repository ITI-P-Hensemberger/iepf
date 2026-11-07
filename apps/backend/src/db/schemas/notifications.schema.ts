// Purpose: Every notification a user was sent, shown in the header's notification panel.
// Unlike push, the panel ignores preferences: every notification is kept here.
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const notifications = pgTable('notifications', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  // A PushCategory, kept as text so a new kind needs no migration.
  category: text().notNull(),
  title: text().notNull(),
  body: text().notNull(),
  // A path on the site, the same one the push opens.
  url: text().notNull(),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  readAt: timestamp({ mode: 'date', withTimezone: true }),
  // Removed from the panel by the user: kept (and counted as read), never shown again.
  archivedAt: timestamp({ mode: 'date', withTimezone: true })
}, table => [
  // Newest first, with id to break ties between rows written in the same instant.
  index('notifications_user_created_idx').on(table.userId, table.createdAt.desc(), table.id.desc()),
  index('notifications_created_idx').on(table.createdAt)
])
