// Purpose: Class sections for students and tutors (e.g., D1, B1, BA).
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { randomUUID } from 'node:crypto'

import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { toZodV4SchemaTyped } from '@/lib/zod-utils'

export const classSections = pgTable('class_sections', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  name: text().notNull().unique(),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
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
