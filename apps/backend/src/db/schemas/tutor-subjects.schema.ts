// Purpose: Tutor-to-subject join table schema and relations.
import { relations } from 'drizzle-orm'
import { pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { subjects } from './subjects.schema'
import { users } from './users.schema'

export const tutorSubjects = pgTable('tutor_subjects', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  tutorId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  subjectId: uuid().notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
}, table => [
  uniqueIndex('tutor_subjects_tutor_subject_unique')
    .on(table.tutorId, table.subjectId)
])

export const tutorSubjectsRelations = relations(tutorSubjects, ({ one }) => ({
  tutor: one(users, {
    fields: [tutorSubjects.tutorId],
    references: [users.id]
  }),
  subject: one(subjects, {
    fields: [tutorSubjects.subjectId],
    references: [subjects.id]
  })
}))
