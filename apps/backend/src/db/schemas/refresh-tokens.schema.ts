import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text().notNull(),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
})

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id]
  })
}))
