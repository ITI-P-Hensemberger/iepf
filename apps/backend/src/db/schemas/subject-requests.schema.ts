// Purpose: Subject request tracking for student demand.
import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { randomUUID } from 'node:crypto'

import { toZodV4SchemaTyped } from '@/lib/zod-utils'

import { subjects } from './subjects.schema'
import { users } from './users.schema'

export const subjectRequests = pgTable('subject_requests', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  studentId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  subjectId: uuid().notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
})

export const selectSubjectRequestsSchema = toZodV4SchemaTyped(createSelectSchema(subjectRequests))

export const insertSubjectRequestsSchema = toZodV4SchemaTyped(createInsertSchema(subjectRequests).omit({
  id: true,
  studentId: true,
  subjectId: true,
  createdAt: true
}).strict())
