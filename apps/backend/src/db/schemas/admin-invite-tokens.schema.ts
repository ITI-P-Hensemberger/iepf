// Purpose: Admin invite token storage.
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

export const adminInviteTokens = pgTable('admin_invite_tokens', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  email: text().notNull(),
  tokenHash: text().notNull(),
  expiresAt: timestamp({ mode: 'date' }).notNull(),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})
