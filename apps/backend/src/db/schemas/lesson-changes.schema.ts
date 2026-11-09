// Purpose: Every time an admin reschedules a lesson, what it was before and after: the history an
// admin reads on the lesson page, since the lesson keeps its id instead of leaving a cancelled copy.
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { lessons } from './lessons.schema'
import { users } from './users.schema'

// Names kept as written at the time: the tutor or subject may be renamed or deleted later.
export interface LessonVersion {
  startAt: string
  durationMinutes: number
  tutorId: string
  tutorName: string
  subjectId: string | null
  subjectName: string | null
}

export const lessonChanges = pgTable('lesson_changes', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  // Cascade: data retention deletes past lessons nobody booked.
  lessonId: uuid().notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  before: jsonb().$type<LessonVersion>().notNull(),
  after: jsonb().$type<LessonVersion>().notNull(),
  actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
  actorName: text().notNull(),
  actorRole: text().notNull(),
  createdAt: timestamp({ mode: 'date', withTimezone: true }).defaultNow().notNull()
}, table => [
  index('lesson_changes_lesson_idx').on(table.lessonId, table.createdAt)
])
