// Purpose: Student profile data (class info and lesson tokens).
import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import { classSections } from './class-sections.schema'
import { users } from './users.schema'

export const studentProfiles = sqliteTable('student_profiles', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  sectionId: text().references(() => classSections.id, { onDelete: 'set null' }),
  year: integer(),
  isActive: integer({ mode: 'boolean' }).notNull().default(false),
  lessonTokens: integer().notNull().default(30),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
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
