// Purpose: Lesson bookings for students with per-student topics.
import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import { lessons } from './lessons.schema'
import { users } from './users.schema'

export const lessonBookings = sqliteTable('lesson_bookings', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  lessonId: text().notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  studentId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  topic: text().notNull(),
  status: text().notNull().default('booked'),
  studentConfirmed: integer({ mode: 'boolean' }),
  studentConfirmedAt: integer({ mode: 'timestamp' }),
  studentConfirmationNote: text(),
  canceledAt: integer({ mode: 'timestamp' }),
  canceledBy: text(),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
}, table => ({
  uniqueLessonStudent: uniqueIndex('lesson_bookings_lesson_student_unique')
    .on(table.lessonId, table.studentId)
}))

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
