// Purpose: Admin profile data placeholder for future extensions.
import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const adminProfiles = sqliteTable('admin_profiles', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
}, table => [
  uniqueIndex('admin_profiles_user_unique').on(table.userId)
])

export const adminProfilesRelations = relations(adminProfiles, ({ one }) => ({
  user: one(users, {
    fields: [adminProfiles.userId],
    references: [users.id]
  })
}))
