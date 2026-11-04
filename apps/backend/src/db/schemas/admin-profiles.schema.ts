// Purpose: Admin profile data placeholder for future extensions.
import { relations } from 'drizzle-orm'
import { boolean, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const adminProfiles = pgTable('admin_profiles', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  isActive: boolean().notNull().default(false),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
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
