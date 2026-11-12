// Purpose: Run the Saturday job for real and pin what it creates for next week: one open lesson
// per tutor and time slot, at the right Rome times, skipping closures and tutors without
// subjects, and nothing new on a second run.
/* eslint-disable node/no-process-env */
import { eq } from 'drizzle-orm'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import db, { closeDb } from '@/db'
import { classSections } from '@/db/schemas/class-sections.schema'
import { globalSettings } from '@/db/schemas/global-settings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { notifications } from '@/db/schemas/notifications.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { tutorWeekdayAvailability } from '@/db/schemas/tutor-weekday-availability.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { assertLocalDatabase } from '@/lib/local-database'
import { addDays, schoolDayKey, schoolTime, weekdayOf } from '@/lib/school-time'

// The job always prepares the week after the current one.
const today = schoolDayKey(new Date())
const monday = addDays(today, 8 - weekdayOf(today))
const wednesday = addDays(monday, 2)
const friday = addDays(monday, 4)

let tutorId: string
let noSubjectsTutorId: string

function runJob() {
  const require = createRequire(import.meta.url)
  const result = spawnSync(process.execPath, [
    require.resolve('tsx/cli'),
    'src/scripts/generate-weekly-lessons.ts'
  ], {
    env: process.env,
    encoding: 'utf8',
    timeout: 60_000
  })
  expect(result.status, result.stderr || result.stdout).toBe(0)
  return result.stdout
}

async function tutor(email: string, withSubjects: string[]) {
  const [section] = await db.select({ id: classSections.id }).from(classSections).limit(1)
  const [user] = await db.insert(users).values({
    email,
    firstName: 'Weekly',
    lastName: 'Tutor',
    passwordHash: 'x',
    role: 'tutor',
    emailVerifiedAt: new Date()
  }).returning({ id: users.id })
  await db.insert(tutorProfiles).values({
    userId: user.id,
    sectionId: section.id,
    year: 5,
    isActive: true
  })
  await db.insert(tutorSettings).values({ tutorId: user.id, dailyCapacity: 2 })
  if (withSubjects.length > 0) {
    await db.insert(tutorSubjects).values(withSubjects.map(subjectId => ({ tutorId: user.id, subjectId })))
  }
  // Monday at 14, Wednesday 14–16 (two slots), Friday at 15; Tuesday off.
  await db.insert(tutorWeekdayAvailability).values([
    {
      tutorId: user.id,
      weekday: 1,
      isAvailable: true,
      startTime: '14:00' as const
    },
    {
      tutorId: user.id,
      weekday: 2,
      isAvailable: false,
      startTime: null
    },
    {
      tutorId: user.id,
      weekday: 3,
      isAvailable: true,
      startTime: '14:00-16:00' as const
    },
    {
      tutorId: user.id,
      weekday: 5,
      isAvailable: true,
      startTime: '15:00' as const
    }
  ])
  return user.id
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  await db.insert(classSections).values({ name: 'WEEKLY' })
  const created = await db.insert(subjects).values([
    { name: 'Matematica', canonicalName: 'weekly_math' },
    { name: 'Fisica', canonicalName: 'weekly_physics' }
  ]).returning({ id: subjects.id })
  tutorId = await tutor('weekly-tutor@example.test', created.map(subject => subject.id))
  noSubjectsTutorId = await tutor('weekly-nosubjects@example.test', [])
  // Next Friday the school is closed.
  await db.insert(globalSettings).values({
    key: 'closureDates',
    value: [friday]
  })
})

afterAll(async () => {
  await closeDb()
})

describe('weekly lesson generation', () => {
  it('creates one open lesson per tutor and time slot, at Rome times, skipping closures', async () => {
    runJob()
    const rows = await db.select().from(lessons).where(eq(lessons.tutorId, tutorId))
    const starts = rows.map(row => row.startAt.toISOString()).sort()

    // Two subjects, yet one lesson per slot: Monday 14, Wednesday 14 and 15; Friday is closed.
    expect(starts).toEqual([
      schoolTime(monday, 14).toISOString(),
      schoolTime(wednesday, 14).toISOString(),
      schoolTime(wednesday, 15).toISOString()
    ])
    for (const row of rows) {
      expect(row).toMatchObject({
        subjectId: null,
        subjectFromBooking: true,
        generatedByJob: true,
        status: 'scheduled',
        seats: 2,
        durationMinutes: 60
      })
      expect(row.generatedForWeek?.toISOString()).toBe(schoolTime(monday).toISOString())
    }
  })

  it('leaves out a tutor without subjects', async () => {
    expect(await db.select().from(lessons).where(eq(lessons.tutorId, noSubjectsTutorId))).toEqual([])
  })

  it('tells the tutor how many lessons it created', async () => {
    const [notice] = await db.select().from(notifications).where(eq(notifications.userId, tutorId))
    expect(notice.body).toContain('3 lezioni assegnate')
  })

  it('adds nothing, and notifies nobody again, when it runs a second time', async () => {
    const output = runJob()
    expect(output).toContain('0 lessons created, 3 skipped')
    expect(await db.select().from(lessons).where(eq(lessons.tutorId, tutorId))).toHaveLength(3)
    expect(await db.select().from(notifications).where(eq(notifications.userId, tutorId))).toHaveLength(1)
  })
})
