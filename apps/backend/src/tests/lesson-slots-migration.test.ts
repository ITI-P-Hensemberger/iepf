import { eq, sql } from 'drizzle-orm'
// Purpose: Pin how migration 0025 folds the upcoming one-per-subject lessons into one lesson per slot.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import db, { closeDb } from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { assertLocalDatabase } from '@/lib/local-database'

const migration = readFileSync(fileURLToPath(new URL('../db/migrations/0025_lesson_slots.sql', import.meta.url)), 'utf8')
// The schema changes already ran with the migrations; the fold runs again on the rows set up here.
const statements = migration.split('--> statement-breakpoint').map(statement => statement.trim())
const foldStatements = statements.slice(statements.findIndex(statement => statement.includes('SET "subject_from_booking" = true')))

const DAY = 24 * 60 * 60 * 1000
let tutorId: string
let studentId: string
let math: string
let physics: string

async function lesson(startAt: Date, subjectId: string, values: Partial<typeof lessons.$inferInsert> = {}) {
  const [row] = await db.insert(lessons).values({
    tutorId,
    subjectId,
    startAt,
    durationMinutes: 60,
    seats: 2,
    generatedByJob: true,
    ...values
  }).returning({ id: lessons.id })
  return row.id
}

async function booking(lessonId: string, subjectId: string, status: string) {
  await db.insert(lessonBookings).values({ lessonId, studentId, subjectId, topic: 'Ripasso', status })
  await db.insert(tokenLedger).values({ studentId, lessonId, delta: -1, reason: 'lesson_booking' })
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  const people = await db.insert(users).values([
    { email: 'slots-tutor@example.test', firstName: 'Slot', lastName: 'Tutor', passwordHash: 'x', role: 'tutor' },
    { email: 'slots-student@example.test', firstName: 'Slot', lastName: 'Student', passwordHash: 'x', role: 'student' }
  ]).returning({ id: users.id })
  tutorId = people[0].id
  studentId = people[1].id
  const created = await db.insert(subjects).values([
    { name: 'Matematica', canonicalName: 'slots_math' },
    { name: 'Fisica', canonicalName: 'slots_physics' }
  ]).returning({ id: subjects.id })
  math = created[0].id
  physics = created[1].id
})

afterAll(async () => {
  await closeDb()
})

describe('migration 0025: one lesson per tutor slot', () => {
  it('keeps one lesson per upcoming slot and the history it carries', async () => {
    // One reference instant, so lessons of the same slot start at exactly the same time.
    const base = Date.now()
    const at = (days: number) => new Date(base + days * DAY)
    const unbookedA = await lesson(at(3), math)
    const unbookedB = await lesson(at(3), physics)
    const booked = await lesson(at(4), math, { status: 'confirmed' })
    const besideBooked = await lesson(at(4), physics)
    const canceledBookingA = await lesson(at(5), math)
    const canceledBookingB = await lesson(at(5), physics)
    const manual = await lesson(at(3), physics, { generatedByJob: false })
    const past = await lesson(at(-3), math)
    await booking(booked, math, 'confirmed')
    await booking(canceledBookingB, physics, 'canceled')

    await db.transaction(async (tx) => {
      for (const statement of foldStatements) {
        await tx.execute(sql.raw(statement))
      }
    })

    const rows = await db.select().from(lessons)
    const byId = new Map(rows.map(row => [row.id, row]))

    // Two lessons nobody booked: one stays, open for any subject.
    const slotThree = [unbookedA, unbookedB].filter(id => byId.has(id))
    expect(slotThree).toHaveLength(1)
    expect(byId.get(slotThree[0])).toMatchObject({ subjectId: null, subjectFromBooking: true, status: 'scheduled' })

    // A booked lesson keeps its subject; the slot's other lesson goes.
    expect(byId.get(booked)).toMatchObject({ subjectId: math, subjectFromBooking: true, status: 'confirmed' })
    expect(byId.has(besideBooked)).toBe(false)

    // A canceled booking and its token moves into the lesson the slot keeps.
    const slotFive = [canceledBookingA, canceledBookingB].filter(id => byId.has(id))
    expect(slotFive).toHaveLength(1)
    expect(byId.get(slotFive[0])).toMatchObject({ subjectId: null, subjectFromBooking: true })
    const [moved] = await db.select().from(lessonBookings).where(eq(lessonBookings.lessonId, slotFive[0]))
    expect(moved).toMatchObject({ subjectId: physics, status: 'canceled' })
    expect(await db.select().from(tokenLedger).where(eq(tokenLedger.lessonId, slotFive[0]))).toHaveLength(1)

    // Lessons an admin created and lessons already past are left as they were.
    expect(byId.get(manual)).toMatchObject({ subjectId: physics, subjectFromBooking: false })
    expect(byId.get(past)).toMatchObject({ subjectId: math, subjectFromBooking: false })
  })
})
