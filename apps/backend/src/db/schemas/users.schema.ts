// Purpose: Users table schema and validation helpers.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { randomUUID } from 'node:crypto'
import z from 'zod'

import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { toZodV4SchemaTyped } from '@/lib/zod-utils'

export const users = sqliteTable('users', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  email: text().notNull().unique(),
  firstName: text().notNull(),
  lastName: text().notNull(),
  passwordHash: text().notNull(),
  role: text().notNull().default('student'),
  emailVerifiedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
})

export const selectUsersSchema = toZodV4SchemaTyped(createSelectSchema(users)
  .omit({
    passwordHash: true
  }))

export const insertUsersSchema = toZodV4SchemaTyped(createInsertSchema(
  users,
  {
    firstName: field => field.min(1).max(100),
    lastName: field => field.min(1).max(100),
    email: () => z.intersection(z.email(), z.string().max(100))
  }
).omit({
  id: true,
  role: true,
  emailVerifiedAt: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true
}).extend({
  password: z.string().min(8).max(200)
}).strict())

const baseUserInputSchema = z.object({
  email: z.intersection(z.email(), z.string().max(100)),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z.string().min(8).max(200)
}).strict()

// Student registration can include optional section/year details.
export const studentRegisterSchema = toZodV4SchemaTyped(baseUserInputSchema.extend({
  sectionId: z.uuid().optional(),
  year: z.number().int().optional()
})).superRefine((value, ctx) => {
  if (value.year !== undefined && (value.year < 1 || value.year > 3)) {
    ctx.addIssue({
      code: 'custom',
      path: ['year'],
      message: 'Year must be between 1 and 3'
    })
  }
})

// Admins can set the role and profile fields when creating users.
export const adminCreateUserSchema = toZodV4SchemaTyped(baseUserInputSchema.extend({
  role: z.enum(['student', 'tutor']).default('student'),
  sectionId: z.uuid().optional(),
  year: z.number().int().optional(),
  isActive: z.boolean().optional()
})).superRefine((value, ctx) => {
  if (value.role !== 'student' && value.isActive !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['isActive'],
      message: 'Activation is only allowed for students'
    })
  }
  if (value.year !== undefined) {
    const min = value.role === 'tutor' ? 4 : 1
    const max = value.role === 'tutor' ? 5 : 3
    if (value.year < min || value.year > max) {
      ctx.addIssue({
        code: 'custom',
        path: ['year'],
        message: `Year must be between ${min} and ${max}`
      })
    }
  }
})

export const selectUsersWithProfilesSchema = toZodV4SchemaTyped(
  selectUsersSchema.and(z.object({
    sectionId: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    isActive: z.boolean().nullable().optional()
  }))
)

export const patchUsersSchema = toZodV4SchemaTyped(z.object({
  email: z.intersection(z.email(), z.string().max(100)).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  password: z.string().min(8).max(200).optional(),
  sectionId: z.uuid().optional(),
  year: z.number().int().optional(),
  isActive: z.boolean().optional()
}).strict()).superRefine((value, ctx) => {
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
