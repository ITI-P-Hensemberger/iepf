// Purpose: Tutor-to-subject join table schema and relations.
import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import { subjects } from './subjects.schema'
import { users } from './users.schema'

export const tutorSubjects = sqliteTable('tutor_subjects', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  tutorId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  subjectId: text().notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
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
