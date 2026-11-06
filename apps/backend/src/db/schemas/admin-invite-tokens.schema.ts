// Purpose: Admin invite token storage.
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

export const adminInviteTokens = pgTable('admin_invite_tokens', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  email: text().notNull(),
  tokenHash: text().notNull(),
  expiresAt: timestamp({ mode: 'date', withTimezone: true }).notNull(),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})
