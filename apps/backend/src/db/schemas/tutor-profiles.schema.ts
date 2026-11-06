// Purpose: Tutor profile data and defaults.
import { relations } from 'drizzle-orm'
import { boolean, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { classSections } from './class-sections.schema'
import { users } from './users.schema'

export const tutorProfiles = pgTable('tutor_profiles', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  sectionId: uuid().notNull().references(() => classSections.id, { onDelete: 'restrict' }),
  year: integer().notNull(),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
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
