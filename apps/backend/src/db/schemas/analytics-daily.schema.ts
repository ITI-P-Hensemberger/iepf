// Purpose: Usage analytics, kept only as daily counts. No user id, session id, IP or
// user agent is ever stored: a row says how many times something happened on a day,
// for a role and a school year, and nothing else.
import { date, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'

export const analyticsDaily = pgTable('analytics_daily', {
  // The day in Europe/Rome, the school's time zone.
  day: date({ mode: 'string' }).notNull(),
  event: text().notNull(),
  // What the event is about: a page template, a notification category, a booking outcome.
  detail: text().notNull().default(''),
  // '' when the count belongs to no one in particular (e.g. push notifications sent).
  role: text().notNull().default(''),
  // School year of students and tutors; 0 for admins, activators and unattributed rows.
  year: integer().notNull().default(0),
  count: integer().notNull()
}, table => [
  primaryKey({
    columns: [
      table.day,
      table.event,
      table.detail,
      table.role,
      table.year
    ]
  })
])
