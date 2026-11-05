// Purpose: Refresh token storage schema.
import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text().notNull(),
  expiresAt: timestamp({ mode: 'date' }).notNull(),
  // Set by the first rotation; the token still works for a short grace period afterwards.
  rotatedAt: timestamp({ mode: 'date' }),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id]
  })
}))
