// Purpose: Short links set by admins: /link/<slug> on the site sends the visitor to the url.
import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

export const links = pgTable('links', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  // Lowercase letters, digits and single dashes (see lib/slug.ts).
  slug: text().notNull(),
  // Always https.
  url: text().notNull(),
  active: boolean().notNull().default(true),
  // Every redirect since the link was made; the daily counts live in analytics_daily.
  clicks: integer().notNull().default(0),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
}, table => [
  uniqueIndex('links_slug_unique').on(table.slug)
])
