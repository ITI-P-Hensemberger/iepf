// Purpose: Tutor invite token storage.
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const tutorInviteTokens = pgTable('tutor_invite_tokens', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  email: text().notNull(),
  tokenHash: text().notNull(),
  // The admin who sent it: the tutor's account is active from sign-up, so they are its activator.
  invitedById: uuid().references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp({ mode: 'date', withTimezone: true }).notNull(),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})
