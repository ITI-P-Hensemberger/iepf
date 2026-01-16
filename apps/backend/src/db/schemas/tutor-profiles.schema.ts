// Purpose: Tutor profile data and defaults.
import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import { classSections } from './class-sections.schema'
import { users } from './users.schema'

export const tutorProfiles = sqliteTable('tutor_profiles', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  sectionId: text().references(() => classSections.id, { onDelete: 'set null' }),
  year: integer(),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
}, table => [
  uniqueIndex('tutor_profiles_user_unique').on(table.userId)
])

export const tutorProfilesRelations = relations(tutorProfiles, ({ one }) => ({
  user: one(users, {
    fields: [tutorProfiles.userId],
    references: [users.id]
  }),
  section: one(classSections, {
    fields: [tutorProfiles.sectionId],
    references: [classSections.id]
  })
}))
