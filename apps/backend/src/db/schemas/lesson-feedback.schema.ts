// Purpose: Feedback exchanged between tutors and students for a lesson booking.
import { relations } from 'drizzle-orm'
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { lessonBookings } from './lesson-bookings.schema'
import { lessons } from './lessons.schema'
import { users } from './users.schema'

export const lessonFeedback = pgTable('lesson_feedback', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  lessonId: uuid().notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  bookingId: uuid().notNull().references(() => lessonBookings.id, { onDelete: 'cascade' }),
  authorUserId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetUserId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  authorRole: text().notNull(),
  rating: integer().notNull(),
  text: text(),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
}, table => ([
  uniqueIndex('lesson_feedback_booking_author_unique')
    .on(table.bookingId, table.authorUserId, table.authorRole)
]))

export const lessonFeedbackRelations = relations(lessonFeedback, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonFeedback.lessonId],
    references: [lessons.id]
  }),
  booking: one(lessonBookings, {
    fields: [lessonFeedback.bookingId],
    references: [lessonBookings.id]
  }),
  author: one(users, {
    fields: [lessonFeedback.authorUserId],
    references: [users.id]
  }),
  target: one(users, {
    fields: [lessonFeedback.targetUserId],
    references: [users.id]
  })
}))
