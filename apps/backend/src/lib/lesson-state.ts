// Purpose: Where a lesson stands, from its status and its time. A lesson's status is only
// 'scheduled', 'confirmed' or 'canceled': one that took place stays 'confirmed', so "done" is read from the clock.
import { sql } from 'drizzle-orm'

import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'

// 'open': a slot nobody has booked yet. Stats and reports leave it out: past ones are deleted at night.
export type LessonState = 'done' | 'upcoming' | 'open' | 'expired' | 'canceled'

interface LessonTiming {
  status: string
  startAt: Date
  durationMinutes: number
}

export function lessonState(lesson: LessonTiming, now = new Date()): LessonState {
  if (lesson.status === 'canceled')
    return 'canceled'
  const ended = lesson.startAt.getTime() + lesson.durationMinutes * 60_000 <= now.getTime()
  if (!ended)
    return lesson.status === 'scheduled' ? 'open' : 'upcoming'
  // Ended: with bookings it took place, without them it simply expired.
  return lesson.status === 'scheduled' ? 'expired' : 'done'
}

const ended = sql`${lessons.startAt} + ${lessons.durationMinutes} * interval '1 minute' <= now()`

// The same rule in SQL, for counting in the database.
export const LESSON_STATE_SQL = {
  done: sql`(${lessons.status} = 'confirmed' and ${ended})`,
  upcoming: sql`(${lessons.status} = 'confirmed' and not ${ended})`,
  open: sql`(${lessons.status} = 'scheduled' and not ${ended})`,
  expired: sql`(${lessons.status} = 'scheduled' and ${ended})`,
  canceled: sql`(${lessons.status} = 'canceled')`
}

// Someone booked it at least once: what stats and reports count. Empty slots, also canceled ones,
// only stand for availability and are deleted at night once their day has passed.
export const LESSON_HAS_BOOKING_SQL = sql`exists (select 1 from ${lessonBookings} where ${lessonBookings.lessonId} = ${lessons.id})`
