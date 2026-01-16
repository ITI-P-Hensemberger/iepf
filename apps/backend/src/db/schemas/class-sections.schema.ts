// Purpose: Class sections for students and tutors (e.g., D1, B1, BA).
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { randomUUID } from 'node:crypto'

import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { toZodV4SchemaTyped } from '@/lib/zod-utils'

export const classSections = sqliteTable('class_sections', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  name: text().notNull().unique(),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
})

export const selectClassSectionsSchema = toZodV4SchemaTyped(createSelectSchema(classSections))

export const insertClassSectionsSchema = toZodV4SchemaTyped(createInsertSchema(classSections, {
  name: field => field.min(1).max(20)
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).strict())

// @ts-expect-error partial exists on zod v4 type
export const patchClassSectionsSchema = insertClassSectionsSchema.partial().superRefine((value, ctx) => {
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
