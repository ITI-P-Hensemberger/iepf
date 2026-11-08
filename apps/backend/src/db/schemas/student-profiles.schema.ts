// Purpose: Student profile data (class info and activation).
import { relations } from 'drizzle-orm'
import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { classSections } from './class-sections.schema'
import { users } from './users.schema'

export const studentProfiles = pgTable('student_profiles', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  sectionId: uuid().references(() => classSections.id, { onDelete: 'set null' }),
  year: integer(),
  isActive: boolean().notNull().default(false),
  // Set when an active student is turned off: tells a deactivated account from one never activated.
  deactivatedAt: timestamp({ mode: 'date', withTimezone: true }),
  deactivationReason: text(),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
}, table => [
  uniqueIndex('student_profiles_user_unique').on(table.userId)
])

export const studentProfilesRelations = relations(studentProfiles, ({ one }) => ({
  user: one(users, {
    fields: [studentProfiles.userId],
    references: [users.id]
  }),
  section: one(classSections, {
    fields: [studentProfiles.sectionId],
    references: [classSections.id]
  })
}))
