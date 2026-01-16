// Purpose: Tutor profile data and defaults.
import { relations } from 'drizzle-orm'
import { integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { classSections } from './class-sections.schema'
import { users } from './users.schema'

export const tutorProfiles = pgTable('tutor_profiles', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  sectionId: uuid().references(() => classSections.id, { onDelete: 'set null' }),
  year: integer(),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
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
