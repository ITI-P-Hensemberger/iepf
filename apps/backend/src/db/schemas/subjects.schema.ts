// Purpose: Subjects table schema and validation helpers.
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { randomUUID } from 'node:crypto'

import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { toZodV4SchemaTyped } from '@/lib/zod-utils'

export const subjects = pgTable('subjects', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  name: text().notNull(),
  canonicalName: text().notNull().unique(),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const selectSubjectsSchema = toZodV4SchemaTyped(createSelectSchema(subjects))

// Admins only write the name: the canonical name is made from it (lib/subject-name.ts).
export const insertSubjectsSchema = toZodV4SchemaTyped(createInsertSchema(subjects, {
  name: field => field.trim().min(1).max(120).refine(value => /[\p{L}\p{N}]/u.test(value), 'Il nome deve contenere lettere o numeri')
}).omit({
  id: true,
  canonicalName: true,
  createdAt: true,
  updatedAt: true
}).strict())

// @ts-expect-error partial exists on zod v4 type
export const patchSubjectsSchema = insertSubjectsSchema.partial().superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: [],
      message: ZOD_ERROR_MESSAGES.NO_UPDATES,
      params: {
        code: ZOD_ERROR_CODES.INVALID_UPDATES
      }
    })
  }
})
