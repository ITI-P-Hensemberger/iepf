import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { randomUUID } from 'node:crypto'
import z from 'zod'

import { toZodV4SchemaTyped } from '@/lib/zod-utils'

export const users = sqliteTable('users', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  email: text().notNull().unique(),
  firstName: text().notNull(),
  lastName: text().notNull(),
  passwordHash: text().notNull(),
  role: text().notNull().default('student'),
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
  passwordHash: true,
  createdAt: true,
  updatedAt: true
}).extend({
  password: z.string().min(8).max(200)
}).strict())

// @ts-expect-error partial exists on zod v4 type
export const patchUsersSchema = insertUsersSchema.partial()
