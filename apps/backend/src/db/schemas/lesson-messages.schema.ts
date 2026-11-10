// Purpose: The chat between a tutor and one student about one booking. Both can write from the
// booking until the lesson ends; afterwards the chat stays readable. Messages are never edited
// or deleted one by one: they go with the booking (and so with the year reset).
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import { lessonBookings } from './lesson-bookings.schema'
import { users } from './users.schema'

export const lessonMessages = pgTable('lesson_messages', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  bookingId: uuid().notNull().references(() => lessonBookings.id, { onDelete: 'cascade' }),
  senderId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text().notNull(),
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  // When the other person read it.
  readAt: timestamp({ mode: 'date', withTimezone: true })
}, table => [
  index('lesson_messages_booking_created_idx').on(table.bookingId, table.createdAt, table.id)
])
