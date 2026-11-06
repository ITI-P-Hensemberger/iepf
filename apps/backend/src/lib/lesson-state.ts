// Purpose: Where a lesson stands, from its status and its time. Nothing ever marks a lesson
// 'completed': one that took place stays 'confirmed', so "done" is read from the clock.
import { sql } from 'drizzle-orm'

import { lessons } from '@/db/schemas/lessons.schema'

export type LessonState = 'done' | 'upcoming' | 'expired' | 'canceled'

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
    return 'upcoming'
  // Ended: with bookings it took place, without them it simply expired.
  return lesson.status === 'scheduled' ? 'expired' : 'done'
}

const ended = sql`${lessons.startAt} + ${lessons.durationMinutes} * interval '1 minute' <= now()`

// The same rule in SQL, for counting in the database.
export const LESSON_STATE_SQL = {
  done: sql`(${lessons.status} in ('confirmed', 'completed') and ${ended})`,
  upcoming: sql`(${lessons.status} <> 'canceled' and not ${ended})`,
  expired: sql`(${lessons.status} = 'scheduled' and ${ended})`,
  canceled: sql`(${lessons.status} = 'canceled')`
}
