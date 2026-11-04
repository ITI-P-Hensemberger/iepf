// Purpose: Email verification token storage.
import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
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

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id]
  })
}))
