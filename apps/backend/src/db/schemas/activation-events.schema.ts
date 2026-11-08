// Purpose: Every time an account is turned on or off, by whom and why: the history an admin reads
// in the user's danger zone.
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

// "activated" is the first time ever; turning it on again after a deactivation is "reactivated".
export const activationEventKind = pgEnum('activation_event_kind', ['activated', 'deactivated', 'reactivated'])

export const activationEvents = pgTable('activation_events', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: activationEventKind().notNull(),
  reason: text(),
  // Kept as written at the time: the actor's account may change or be deleted later.
  actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
  actorName: text().notNull(),
  actorRole: text().notNull(),
  createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull()
}, table => [
  index('activation_events_user_idx').on(table.userId, table.createdAt)
])
