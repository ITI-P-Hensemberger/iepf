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
  // Parent contact fields apply to student accounts only.
  parentFirstName: text(),
  parentLastName: text(),
  parentEmail: text(),
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
    email: () => z.intersection(z.email(), z.string().max(100)),
    parentFirstName: field => field.min(1).max(100).optional(),
    parentLastName: field => field.min(1).max(100).optional(),
    parentEmail: () => z.intersection(z.email(), z.string().max(100)).optional()
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

// Admins can set the role when creating users; tutors cannot include parent info.
export const adminInsertUsersSchema = toZodV4SchemaTyped(createInsertSchema(
  users,
  {
    firstName: field => field.min(1).max(100),
    lastName: field => field.min(1).max(100),
    email: () => z.intersection(z.email(), z.string().max(100)),
    parentFirstName: field => field.min(1).max(100).optional(),
    parentLastName: field => field.min(1).max(100).optional(),
    parentEmail: () => z.intersection(z.email(), z.string().max(100)).optional()
  }
).omit({
  id: true,
  emailVerifiedAt: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true
}).extend({
  password: z.string().min(8).max(200),
  role: z.enum(['student', 'tutor']).default('student')
}).strict()).superRefine((value, ctx) => {
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

// @ts-expect-error partial exists on zod v4 type
export const patchUsersSchema = insertUsersSchema.partial().superRefine((value, ctx) => {
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
