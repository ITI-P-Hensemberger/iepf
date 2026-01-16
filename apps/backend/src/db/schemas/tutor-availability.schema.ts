// Purpose: Tutor availability windows for lesson scheduling.
import { relations } from 'drizzle-orm'
import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const tutorAvailability = pgTable('tutor_availability', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  tutorId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  startAt: timestamp({ mode: 'date' }).notNull(),
  durationMinutes: integer().notNull(),
  seats: integer().notNull(),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const tutorAvailabilityRelations = relations(tutorAvailability, ({ one }) => ({
  tutor: one(users, {
    fields: [tutorAvailability.tutorId],
    references: [users.id]
  })
}))
