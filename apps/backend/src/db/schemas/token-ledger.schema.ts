// Purpose: Token ledger for auditing student lesson token changes.
import { relations } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { lessons } from './lessons.schema'
import { users } from './users.schema'

export const tokenLedger = pgTable('token_ledger', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  lessonId: uuid().references(() => lessons.id, { onDelete: 'set null' }),
  delta: integer().notNull(),
  reason: text().notNull(),
  // The admin who changed the hours by hand; empty for automatic entries and older rows.
  createdById: uuid().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
}, table => [
  index('token_ledger_student_id_idx').on(table.studentId)
])

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
