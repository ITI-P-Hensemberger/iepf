// Purpose: Records reminders already sent, so rerunning a job does not send them again.
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const reminderDeliveries = pgTable('reminder_deliveries', {
  key: text().primaryKey(),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
})
