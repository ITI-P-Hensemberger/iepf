// Purpose: Pin who the evening reminder asks for feedback, a feedback an admin deleted included.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import db, { closeDb } from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { seedDevelopmentData } from '@/lib/dev-seed'
import { pendingFeedback } from '@/lib/feedback-reminders'
import { assertLocalDatabase } from '@/lib/local-database'

// A fixed Wednesday evening, with one lesson that afternoon: no other seeded lesson falls on it.
const NOW = new Date('2026-03-11T17:00:00Z')
let ids: Record<string, string>
let lessonId: string
let bookingId: string

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  const subjectId = (await db.query.subjects.findFirst())!.id
  const [lesson] = await db.insert(lessons).values({ tutorId: ids.tutor, subjectId, startAt: new Date('2026-03-11T14:00:00Z'), durationMinutes: 60, seats: 2, status: 'confirmed' }).returning({ id: lessons.id })
  lessonId = lesson.id
  const [booking] = await db.insert(lessonBookings).values({ lessonId, studentId: ids.student, subjectId, topic: 'Equazioni', status: 'confirmed' }).returning({ id: lessonBookings.id })
  bookingId = booking.id
})

afterAll(async () => {
  await closeDb()
})

describe('pendingFeedback', () => {
  it('asks the student and the tutor until each writes one, and again after an admin deletes it', async () => {
    expect(await pendingFeedback(NOW)).toEqual(new Map([
      [ids.student, { role: 'student', count: 1 }],
      [ids.tutor, { role: 'tutor', count: 1 }]
    ]))

    const [tutorFeedback] = await db.insert(lessonFeedback).values({ lessonId, bookingId, authorUserId: ids.tutor, targetUserId: ids.student, authorRole: 'tutor', rating: 4 }).returning({ id: lessonFeedback.id })
    expect(await pendingFeedback(NOW)).toEqual(new Map([[ids.student, { role: 'student', count: 1 }]]))

    await db.update(lessonFeedback).set({ deletedAt: NOW, deletedByUserId: ids.admin }).where(eq(lessonFeedback.id, tutorFeedback.id))
    expect((await pendingFeedback(NOW)).get(ids.tutor)).toEqual({ role: 'tutor', count: 1 })
  })
})
