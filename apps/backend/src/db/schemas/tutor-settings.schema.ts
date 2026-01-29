// Purpose: Tutor-specific lesson defaults configured by admins.
import { relations } from 'drizzle-orm'
import { integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const tutorSettings = pgTable('tutor_settings', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  tutorId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  dailyCapacity: integer().notNull().default(1),
  createdAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
}, table => [
  uniqueIndex('tutor_settings_tutor_unique').on(table.tutorId)
])

export const tutorSettingsRelations = relations(tutorSettings, ({ one }) => ({
  tutor: one(users, {
    fields: [tutorSettings.tutorId],
    references: [users.id]
  })
}))
