// Purpose: Token ledger for auditing student lesson token changes.
import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import { lessons } from './lessons.schema'
import { users } from './users.schema'

export const tokenLedger = sqliteTable('token_ledger', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  studentId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  lessonId: text().references(() => lessons.id, { onDelete: 'set null' }),
  delta: integer().notNull(),
  reason: text().notNull(),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
})

export const tokenLedgerRelations = relations(tokenLedger, ({ one }) => ({
  student: one(users, {
    fields: [tokenLedger.studentId],
    references: [users.id]
  }),
  lesson: one(lessons, {
    fields: [tokenLedger.lessonId],
    references: [lessons.id]
  })
}))
