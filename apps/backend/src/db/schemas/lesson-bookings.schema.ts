// Purpose: Lesson bookings for students with per-student topics.
import { relations, sql } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { lessons } from './lessons.schema'
import { users } from './users.schema'

export const lessonBookings = pgTable('lesson_bookings', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  lessonId: uuid().notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  studentId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  topic: text().notNull(),
  status: text().notNull().default('confirmed'),
  countsForStudent: boolean().notNull().default(true),
  studentPresence: boolean(),
  studentPresenceAt: timestamp({ mode: 'date' }),
  canceledAt: timestamp({ mode: 'date' }),
  canceledBy: uuid(),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
}, table => [
  uniqueIndex('lesson_bookings_confirmed_unique')
    .on(table.lessonId, table.studentId)
    .where(sql`${table.status} = 'confirmed'`)
])

export const lessonBookingsRelations = relations(lessonBookings, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonBookings.lessonId],
    references: [lessons.id]
  }),
  student: one(users, {
    fields: [lessonBookings.studentId],
    references: [users.id]
  })
}))
