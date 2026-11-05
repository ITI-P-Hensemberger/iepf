// Purpose: Pin what GET /lessons returns across pages, filters and sort orders.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer } from '@/lib/mailer'
import { resetRateLimiters } from '@/middlewares/rate-limit'

const HOUR = 60 * 60 * 1000
const firstStart = new Date('2031-03-03T09:00:00.000Z')

let token: string
let tutorId: string
// Lesson ids in start order. The last two start together, so only the id can order them.
let ordered: string[]

async function list(query: Record<string, string | number>) {
  const params = new URLSearchParams({ tutorId, ...query } as Record<string, string>)
  const response = await app.request(`/lessons?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  expect(response.status).toBe(200)
  return response.json() as Promise<{
    data: Array<Record<string, unknown> & { id: string }>
    total: number
    limit: number
    offset: number
  }>
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  if (new URL(env.DATABASE_URL).pathname !== '/iepf_test') {
    throw new Error('Integration tests require the isolated iepf_test database')
  }
  await cleanDatabase()
  const ids = await seedDevelopmentData()
  resetRateLimiters()
  const login = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password: DEV_PASSWORD })
  })
  token = (await login.json()).accessToken

  const [tutor] = await db.insert(users).values({
    email: 'list-lessons-tutor@example.test',
    firstName: 'Zebedeo',
    lastName: 'Paginato',
    passwordHash: 'unused',
    role: 'tutor',
    emailVerifiedAt: new Date()
  }).returning({ id: users.id })
  tutorId = tutor.id
  await db.insert(tutorSettings).values({ tutorId, dailyCapacity: 7 })

  const [subject] = await db.select({ id: subjects.id }).from(subjects).limit(1)
  const starts = [0, 1, 2, 3, 3].map(hours => new Date(firstStart.getTime() + hours * HOUR))
  // Created newest first, so sorting by creation reverses the start order.
  const created = await db.insert(lessons).values(starts.map((startAt, index) => ({
    tutorId,
    subjectId: subject.id,
    startAt,
    durationMinutes: 60,
    seats: 3,
    status: index === 0 ? 'canceled' : 'scheduled',
    createdAt: new Date(firstStart.getTime() - index * HOUR)
  }))).returning({ id: lessons.id })
  const [first, second, third, ...sameStart] = created.map(({ id }) => id)
  ordered = [first, second, third, ...sameStart.toSorted()]

  await db.insert(lessonBookings).values([
    { lessonId: second, studentId: ids.student, status: 'confirmed', topic: 'Ripasso' },
    { lessonId: third, studentId: ids.student, status: 'canceled', topic: 'Ripasso' }
  ])
})

afterAll(async () => {
  closeMailer()
  await closeDb()
})

describe('listing lessons', () => {
  it('returns each lesson exactly once across pages, in start order', async () => {
    const pages = await Promise.all([0, 2, 4].map(offset => list({ limit: 2, offset })))

    expect(pages.flatMap(page => page.data.map(({ id }) => id))).toEqual(ordered)
    expect(pages.map(page => page.data.length)).toEqual([2, 2, 1])
    expect(pages.map(page => page.total)).toEqual([5, 5, 5])
    expect(pages.map(page => page.offset)).toEqual([0, 2, 4])
    expect(pages[0].limit).toBe(2)
  })

  it('keeps the total on a page past the end', async () => {
    const page = await list({ limit: 2, offset: 50 })

    expect(page).toEqual({ data: [], total: 5, limit: 2, offset: 50 })
  })

  it('lists every lesson when no filter is given', async () => {
    const response = await app.request('/lessons?limit=200', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const page = await response.json()
    const stored = await db.select({ id: lessons.id }).from(lessons)

    expect(page.total).toBe(stored.length)
    expect(page.data).toHaveLength(stored.length)
    expect(stored.length).toBeGreaterThan(ordered.length)
  })

  it('reports no lessons when nothing matches', async () => {
    expect(await list({ q: 'nessuna-corrispondenza' })).toEqual({ data: [], total: 0, limit: 50, offset: 0 })
  })

  it('sorts by start and by creation in both directions', async () => {
    const ids = async (query: Record<string, string>) => (await list(query)).data.map(({ id }) => id)

    expect(await ids({ sortDir: 'desc' })).toEqual([ordered[3], ordered[4], ordered[2], ordered[1], ordered[0]])
    expect((await ids({ sortBy: 'createdAt' }))[4]).toBe(ordered[0])
    expect((await ids({ sortBy: 'createdAt', sortDir: 'desc' }))[0]).toBe(ordered[0])
  })

  it('counts only the matching lessons in the total', async () => {
    const byStatus = await list({ status: 'canceled' })
    expect(byStatus.total).toBe(1)
    expect(byStatus.data.map(({ id }) => id)).toEqual([ordered[0]])

    const byName = await list({ q: 'zebedeo', limit: 1 })
    expect(byName.total).toBe(5)
    expect(byName.data).toHaveLength(1)

    const byDate = await list({ from: new Date(firstStart.getTime() + 2 * HOUR).toISOString() })
    expect(byDate.data.map(({ id }) => id)).toEqual(ordered.slice(2))
    expect(byDate.total).toBe(3)
  })

  it('calculates seats and capacity for the lessons on the page', async () => {
    const { data } = await list({ limit: 2, offset: 1 })

    expect(data[0]).toEqual({
      id: ordered[1],
      tutorId,
      subjectId: expect.any(String),
      startAt: new Date(firstStart.getTime() + HOUR).toISOString(),
      durationMinutes: 60,
      lessonCapacity: 3,
      dailyCapacity: 7,
      dailyOccupancy: 1,
      availableSeats: 2,
      countsForTutor: false,
      status: 'scheduled'
    })
    // A canceled booking frees its seat, and the day's occupancy spans lessons off this page.
    expect(data[1]).toMatchObject({ id: ordered[2], availableSeats: 3, dailyOccupancy: 1 })
  })
})
