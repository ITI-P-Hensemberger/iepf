// Purpose: Tutor-specific lesson defaults configured by admins.
import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const tutorSettings = sqliteTable('tutor_settings', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  tutorId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  defaultStartTime: text().notNull().default('15:00'),
  defaultDurationMinutes: integer().notNull().default(60),
  defaultSeats: integer().notNull().default(2),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
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
