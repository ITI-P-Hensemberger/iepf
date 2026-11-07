// Purpose: The questions and answers of the public FAQ page, written and ordered by admins.
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

export const faqs = pgTable('faqs', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  question: text().notNull(),
  // Markdown, rendered by the frontend without raw HTML, like the popups.
  answer: text().notNull(),
  // Order on the page, from 0; the admins move questions up and down.
  position: integer().notNull(),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
}, table => [
  index('faqs_position_idx').on(table.position)
])
