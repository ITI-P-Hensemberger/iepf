// Purpose: Lesson bookings for students with per-student topics.
import { relations } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { lessons } from './lessons.schema'
import { users } from './users.schema'

export const lessonBookings = pgTable('lesson_bookings', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  lessonId: uuid().notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  studentId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  topic: text().notNull(),
  status: text().notNull().default('booked'),
  studentConfirmed: boolean(),
  studentConfirmedAt: timestamp({ mode: 'date' }),
  studentConfirmationNote: text(),
  canceledAt: timestamp({ mode: 'date' }),
  canceledBy: uuid(),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

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
