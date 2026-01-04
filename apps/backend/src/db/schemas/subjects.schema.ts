// Purpose: Subjects table schema and validation helpers.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { randomUUID } from 'node:crypto'

import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { toZodV4SchemaTyped } from '@/lib/zod-utils'

export const subjects = sqliteTable('subjects', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  name: text().notNull(),
  canonicalName: text().notNull().unique(),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
})

export const selectSubjectsSchema = toZodV4SchemaTyped(createSelectSchema(subjects))

export const insertSubjectsSchema = toZodV4SchemaTyped(createInsertSchema(subjects, {
  name: field => field.min(1).max(120),
  canonicalName: field => field.min(1).max(120)
}).omit({
  id: true,
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
