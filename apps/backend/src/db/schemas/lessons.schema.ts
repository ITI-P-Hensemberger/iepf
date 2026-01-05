// Purpose: Lesson sessions scheduled for tutors and subjects.
import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import { subjects } from './subjects.schema'
import { tutorAvailability } from './tutor-availability.schema'
import { users } from './users.schema'

export const lessons = sqliteTable('lessons', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  tutorId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  subjectId: text().notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  availabilityId: text().references(() => tutorAvailability.id, { onDelete: 'set null' }),
  startAt: integer({ mode: 'timestamp' }).notNull(),
  durationMinutes: integer().notNull(),
  seats: integer().notNull(),
  status: text().notNull().default('scheduled'),
  tutorConfirmed: integer({ mode: 'boolean' }),
  tutorConfirmedAt: integer({ mode: 'timestamp' }),
  tutorConfirmationNote: text(),
  adminResolvedAt: integer({ mode: 'timestamp' }),
  adminResolvedBy: text(),
  adminResolutionNote: text(),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
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
