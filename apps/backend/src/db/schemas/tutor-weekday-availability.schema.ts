// Purpose: Tutor weekday availability for automated lesson generation.
import { relations } from 'drizzle-orm'
import { boolean, pgEnum, pgTable, smallint, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const weekdayStartTime = pgEnum('weekday_start_time', ['14:00', '15:00'])

export const tutorWeekdayAvailability = pgTable('tutor_weekday_availability', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  tutorId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  weekday: smallint().notNull(), // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  isAvailable: boolean().notNull().default(false),
  startTime: weekdayStartTime('start_time'),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
}, table => [
  uniqueIndex('tutor_weekday_availability_tutor_weekday_unique')
    .on(table.tutorId, table.weekday)
])

export const tutorWeekdayAvailabilityRelations = relations(tutorWeekdayAvailability, ({ one }) => ({
  tutor: one(users, {
    fields: [tutorWeekdayAvailability.tutorId],
    references: [users.id]
  })
}))
