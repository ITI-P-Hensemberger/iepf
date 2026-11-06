// Purpose: Popups an admin writes for chosen roles, and who closed them for good.
import { boolean, index, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { users } from './users.schema'

// once_account: closed once, never again on any device (stored in announcement_dismissals).
// once_device: closed once, never again in that browser (stored by the browser).
// every_session: back at every login, while it stays visible.
export const ANNOUNCEMENT_DISMISS_MODES = ['once_account', 'once_device', 'every_session'] as const
export const announcementDismissMode = pgEnum('announcement_dismiss_mode', ANNOUNCEMENT_DISMISS_MODES)

export const announcements = pgTable('announcements', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  title: text().notNull(),
  // Markdown, rendered by the frontend without raw HTML.
  body: text().notNull(),
  linkUrl: text(),
  linkLabel: text(),
  roles: text().array().notNull(),
  dismissMode: announcementDismissMode().notNull(),
  // Visible while active and between startsAt and expiresAt; null means no bound.
  active: boolean().notNull().default(false),
  startsAt: timestamp({ mode: 'date', withTimezone: true }),
  expiresAt: timestamp({ mode: 'date', withTimezone: true }),
  createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const announcementDismissals = pgTable('announcement_dismissals', {
  announcementId: uuid().notNull().references(() => announcements.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  dismissedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
}, table => [
  primaryKey({ columns: [table.announcementId, table.userId] }),
  index('announcement_dismissals_user_idx').on(table.userId)
])
