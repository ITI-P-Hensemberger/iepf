// Purpose: Lesson sessions scheduled for tutors and subjects.
import { relations } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { subjects } from './subjects.schema'
import { users } from './users.schema'

export const lessons = pgTable('lessons', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  tutorId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  subjectId: uuid().notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  startAt: timestamp({ mode: 'date', withTimezone: true }).notNull(),
  durationMinutes: integer().notNull(),
  seats: integer().notNull(),
  status: text().notNull().default('scheduled'),
  countsForTutor: boolean().notNull().default(false),
  generatedByJob: boolean().default(false),
  generatedForWeek: timestamp({ mode: 'date', withTimezone: true }),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
}, table => [
  index('lessons_start_at_idx').on(table.startAt),
  index('lessons_tutor_id_idx').on(table.tutorId)
])

export const lessonsRelations = relations(lessons, ({ one }) => ({
  tutor: one(users, {
    fields: [lessons.tutorId],
    references: [users.id]
  }),
  subject: one(subjects, {
    fields: [lessons.subjectId],
    references: [subjects.id]
  })
}))
