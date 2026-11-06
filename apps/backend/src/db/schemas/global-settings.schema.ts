// Purpose: Global application settings stored as JSON blobs.
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

export const globalSettings = pgTable('global_settings', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  key: text().notNull().unique(),
  value: jsonb().notNull(),
  updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})
