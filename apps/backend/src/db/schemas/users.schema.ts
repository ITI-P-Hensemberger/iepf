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

// Student-only parent contact fields for registration and profile updates.
export const studentProfileInputSchema = z.object({
  parentFirstName: z.string().min(1).max(100).optional(),
  parentLastName: z.string().min(1).max(100).optional(),
  parentEmail: z.intersection(z.email(), z.string().max(100)).optional()
})

const baseUserInputSchema = z.object({
  email: z.intersection(z.email(), z.string().max(100)),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
  parentFirstName: z.string().min(1).max(100).optional(),
  parentLastName: z.string().min(1).max(100).optional(),
  parentEmail: z.intersection(z.email(), z.string().max(100)).optional()
}).strict()

// Student registration includes optional parent contact fields.
export const studentRegisterSchema = toZodV4SchemaTyped(baseUserInputSchema)

// Admins can set the role when creating users; tutors cannot include parent info.
export const adminCreateUserSchema = toZodV4SchemaTyped(baseUserInputSchema.extend({
  role: z.enum(['student', 'tutor']).default('student')
})).superRefine((value, ctx) => {
  if (value.role !== 'student') {
    const hasParentInfo = Boolean(value.parentFirstName || value.parentLastName || value.parentEmail)
    if (hasParentInfo) {
      ctx.addIssue({
        code: 'custom',
        path: ['role'],
        message: 'Parent information is only allowed for students'
      })
    }
  }
})

export const selectUsersWithProfilesSchema = toZodV4SchemaTyped(
  selectUsersSchema.and(z.object({
    parentFirstName: z.string().nullable().optional(),
    parentLastName: z.string().nullable().optional(),
    parentEmail: z.string().nullable().optional()
  }))
)

export const patchUsersSchema = toZodV4SchemaTyped(z.object({
  email: z.intersection(z.email(), z.string().max(100)).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  password: z.string().min(8).max(200).optional(),
  parentFirstName: z.string().min(1).max(100).optional(),
  parentLastName: z.string().min(1).max(100).optional(),
  parentEmail: z.intersection(z.email(), z.string().max(100)).optional()
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
