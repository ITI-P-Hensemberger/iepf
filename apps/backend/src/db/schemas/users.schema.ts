// Purpose: Users table schema and validation helpers.
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { randomUUID } from 'node:crypto'
import z from 'zod'

import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { toZodV4SchemaTyped } from '@/lib/zod-utils'

export const users = pgTable('users', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  email: text().notNull().unique(),
  firstName: text().notNull(),
  lastName: text().notNull(),
  passwordHash: text().notNull(),
  role: text().notNull().default('student'),
  emailVerifiedAt: timestamp({ mode: 'date' }),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const SCHOOL_EMAIL_DOMAIN = '@hensemberger.it'

// Stored addresses are lowercase and login lowercases its input, so every address must be
// normalized on the way in or the account stops being reachable.
export const normalizedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())

export const schoolEmailSchema = normalizedEmailSchema
  .refine(email => email.length <= 100, { message: 'Massimo 100 caratteri' })
  .refine(email => email.endsWith(SCHOOL_EMAIL_DOMAIN), {
    message: `Utilizza una mail ${SCHOOL_EMAIL_DOMAIN}`
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
    email: () => schoolEmailSchema
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
  email: schoolEmailSchema,
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
      message: 'L\'anno deve essere compreso tra 1 e 3'
    })
  }
})

export const selectUsersWithProfilesSchema = toZodV4SchemaTyped(
  selectUsersSchema.and(z.object({
    sectionId: z.string().nullable().optional(),
    sectionName: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    isActive: z.boolean().nullable().optional(),
    lessonTokens: z.number().nullable().optional()
  }))
)

export const patchUsersSchema = toZodV4SchemaTyped(z.object({
  email: schoolEmailSchema.optional(),
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
