// Purpose: Lesson sessions scheduled for tutors and subjects.
import { relations } from 'drizzle-orm'
import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { subjects } from './subjects.schema'
import { tutorAvailability } from './tutor-availability.schema'
import { users } from './users.schema'

export const lessons = pgTable('lessons', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  tutorId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  subjectId: uuid().notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  availabilityId: uuid().references(() => tutorAvailability.id, { onDelete: 'set null' }),
  startAt: timestamp({ mode: 'date' }).notNull(),
  durationMinutes: integer().notNull(),
  seats: integer().notNull(),
  status: text().notNull().default('scheduled'),
  tutorConfirmed: boolean(),
  tutorConfirmedAt: timestamp({ mode: 'date' }),
  tutorConfirmationNote: text(),
  adminResolvedAt: timestamp({ mode: 'date' }),
  adminResolvedBy: uuid(),
  adminResolutionNote: text(),
  generatedByJob: boolean().default(false),
  generatedForWeek: timestamp({ mode: 'date' }),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const lessonsRelations = relations(lessons, ({ one }) => ({
  tutor: one(users, {
    fields: [lessons.tutorId],
    references: [users.id]
  }),
  availability: one(tutorAvailability, {
    fields: [lessons.availabilityId],
    references: [tutorAvailability.id]
  }),
  subject: one(subjects, {
    fields: [lessons.subjectId],
    references: [subjects.id]
  })
}))
