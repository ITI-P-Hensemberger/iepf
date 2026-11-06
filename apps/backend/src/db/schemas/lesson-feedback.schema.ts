// Purpose: Feedback exchanged between tutors and students for a lesson booking.
import { isNull, relations } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
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
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  // Deleted by an admin: hidden everywhere, kept for its history. The author may write again.
  deletedAt: timestamp({ mode: 'date', withTimezone: true }),
  deletedByUserId: uuid().references(() => users.id, { onDelete: 'set null' })
}, table => ([
  uniqueIndex('lesson_feedback_booking_author_unique')
    .on(table.bookingId, table.authorUserId, table.authorRole)
    .where(isNull(table.deletedAt))
]))

// Every state a feedback went through, the first one included: who wrote it (the author
// or an admin), the rating and the text. Read by the author and by the admins.
export const lessonFeedbackVersions = pgTable('lesson_feedback_versions', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  feedbackId: uuid().notNull().references(() => lessonFeedback.id, { onDelete: 'cascade' }),
  rating: integer().notNull(),
  text: text(),
  editorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
  editorRole: text().notNull(),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
}, table => ([
  index('lesson_feedback_versions_feedback_idx').on(table.feedbackId, table.createdAt)
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
