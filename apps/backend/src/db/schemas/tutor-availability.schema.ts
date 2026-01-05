// Purpose: Tutor availability windows for lesson scheduling.
import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const tutorAvailability = sqliteTable('tutor_availability', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  tutorId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  weekday: integer().notNull(),
  startTime: text().notNull(),
  endTime: text().notNull(),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
})

export const tutorAvailabilityRelations = relations(tutorAvailability, ({ one }) => ({
  tutor: one(users, {
    fields: [tutorAvailability.tutorId],
    references: [users.id]
  })
}))
