// Purpose: Pin what usage analytics store: daily counts only, from a closed set of values,
// never while impersonating, and nothing older than the retention period.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { analyticsDaily } from '@/db/schemas/analytics-daily.schema'
import { auditLogs } from '@/db/schemas/audit-logs.schema'
import { globalSettings } from '@/db/schemas/global-settings.schema'
import env from '@/env'
import { addCounts, analyticsCutoffDay, BOOKING_OUTCOMES, clearAnalyticsCache, deleteOldAnalytics, rollUpActiveUsers, romeDay, sanitizeDetail, SCHOOL_YEAR_START_KEY, waitForPendingCounts } from '@/lib/analytics'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer, waitForPendingMail } from '@/lib/mailer'
import { waitForPendingPush } from '@/lib/push'
import { resetRateLimiters } from '@/middlewares/rate-limit'

let ids: Record<string, string>
const tokens: Record<string, string> = {}
const DAY = 24 * 60 * 60 * 1000

async function call(path: string, options: { token?: string, method?: string, body?: unknown } = {}) {
  return app.request(path, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(options.token
        ? { Authorization: `Bearer ${options.token}` }
        : {})
    },
    body: options.body
      ? JSON.stringify(options.body)
      : undefined
  })
}

function send(token: string, events: unknown[]) {
  return call('/analytics/events', {
    token,
    body: { events }
  })
}

async function rows() {
  // Sorted by code point in JS: the database collation may order '/' and letters differently.
  const key = (row: { event: string, detail: string }) => `${row.event} ${row.detail}`
  const result = await db.select().from(analyticsDaily)
  return result.sort((a, b) => key(a) < key(b)
    ? -1
    : key(a) > key(b)
      ? 1
      : 0)
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  for (const role of ['admin', 'tutor', 'student']) {
    const login = await call('/auth/login', {
      body: { email: `${role}@example.test`, password: DEV_PASSWORD }
    })
    tokens[role] = (await login.json()).accessToken
  }
})

beforeEach(async () => {
  resetRateLimiters()
  clearAnalyticsCache()
  await waitForPendingCounts()
  await db.delete(analyticsDaily)
})

afterAll(async () => {
  await waitForPendingPush()
  await waitForPendingCounts()
  await waitForPendingMail()
  closeMailer()
  await closeDb()
})

describe('sanitizeDetail', () => {
  it('keeps only known pages, categories and error names', () => {
    expect(sanitizeDetail('page_view', '/tutor/lessons/[id]')).toBe('/tutor/lessons/[id]')
    expect(sanitizeDetail('page_view', '/student/mario.rossi@example.test')).toBe('other')
    expect(sanitizeDetail('push_open', 'reminders')).toBe('reminders')
    expect(sanitizeDetail('push_open', 'whatever')).toBe('other')
    expect(sanitizeDetail('client_error', 'TypeError@/student/book')).toBe('TypeError@/student/book')
    expect(sanitizeDetail('client_error', 'Cannot read mario@/x')).toBe('Error@other')
    expect(sanitizeDetail('bell_open', 'anything')).toBe('')
  })
})

describe('collecting usage counts', () => {
  it('adds counts per day, role and school year, without anything about the person', async () => {
    const response = await send(tokens.student, [
      { event: 'page_view', detail: '/student/book', count: 2 },
      { event: 'page_view', detail: '/student/book' },
      { event: 'page_view', detail: '/student/00000000-0000-4000-8000-000000000102' },
      { event: 'book_dialog_open' }
    ])
    expect(response.status).toBe(204)
    await send(tokens.tutor, [
      { event: 'bell_open' }
    ])

    expect(await rows()).toEqual([
      {
        day: romeDay(new Date()),
        event: 'bell_open',
        detail: '',
        role: 'tutor',
        year: 4,
        count: 1
      },
      {
        day: romeDay(new Date()),
        event: 'book_dialog_open',
        detail: '',
        role: 'student',
        year: 2,
        count: 1
      },
      {
        day: romeDay(new Date()),
        event: 'page_view',
        detail: '/student/book',
        role: 'student',
        year: 2,
        count: 3
      },
      {
        day: romeDay(new Date()),
        event: 'page_view',
        detail: 'other',
        role: 'student',
        year: 2,
        count: 1
      }
    ])
  })

  it('refuses unknown events and visitors', async () => {
    expect((await send(tokens.student, [
      { event: 'login_password' }
    ])).status).toBe(422)
    expect((await send(tokens.student, [])).status).toBe(422)
    expect((await call('/analytics/events', {
      body: {
        events: [
          { event: 'bell_open' }
        ]
      }
    })).status).toBe(401)
    expect(await rows()).toEqual([])
  })

  it('stores nothing while an admin impersonates the user', async () => {
    const impersonation = await call('/admin/impersonate', {
      token: tokens.admin,
      body: { userId: ids.student }
    })
    const { token } = await impersonation.json()
    expect((await send(token, [
      { event: 'page_view', detail: '/student' }
    ])).status).toBe(204)
    expect(await rows()).toEqual([])
  })

  it('limits batches per account', async () => {
    const statuses = []
    for (let i = 0; i < 21; i += 1) {
      statuses.push((await send(tokens.student, [
        { event: 'bell_open' }
      ])).status)
    }
    expect(statuses.slice(0, 20).every(status => status === 204)).toBe(true)
    expect(statuses[20]).toBe(429)
  })
})

describe('server-side counters', () => {
  it('counts a student booking outcome', async () => {
    // The demo student already holds this lesson: refused, for one reason or another.
    await call('/lessons/00000000-0000-4000-8000-000000000102/book', {
      token: tokens.student,
      body: { topic: 'Ripasso' }
    })
    await waitForPendingCounts()
    const [row] = await db.select().from(analyticsDaily).where(eq(analyticsDaily.event, 'booking'))
    expect(row).toMatchObject({ role: 'student', year: 2, count: 1 })
    expect(BOOKING_OUTCOMES).toContain(row.detail)
    expect(row.detail).not.toBe('ok')
  })
})

describe('rollUpActiveUsers', () => {
  const now = new Date('2026-03-10T09:00:00Z')

  it('counts distinct users per day and leaves out impersonated requests', async () => {
    await db.delete(auditLogs)
    const yesterday = new Date(now.getTime() - DAY)
    const audit = (actorId: string, createdAt: Date, metadata: object = {}) => ({
      actorId,
      action: 'GET /x',
      method: 'GET',
      path: '/x',
      status: 200,
      durationMs: 1,
      createdAt,
      metadata: JSON.stringify(metadata)
    })
    await db.insert(auditLogs).values([
      audit(ids.student, yesterday),
      audit(ids.student, new Date(yesterday.getTime() + 60_000)),
      audit(ids.tutor, yesterday),
      audit(ids.admin, yesterday, { impersonatedUserId: ids.student }),
      // Today is not over yet: not counted.
      audit(ids.student, now)
    ])

    await rollUpActiveUsers(now, 90)
    await rollUpActiveUsers(now, 90)
    const result = await rows()
    expect(result.map(({ day, role, year, count }) => ({ day, role, year, count }))).toEqual([
      {
        day: romeDay(yesterday),
        role: 'student',
        year: 2,
        count: 1
      },
      {
        day: romeDay(yesterday),
        role: 'tutor',
        year: 4,
        count: 1
      }
    ])
  })

  it('counts nothing from before the last school-year reset', async () => {
    await db.delete(auditLogs)
    await db.delete(analyticsDaily)
    const audit = (createdAt: Date) => ({
      actorId: ids.admin,
      action: 'GET /x',
      method: 'GET',
      path: '/x',
      status: 200,
      durationMs: 1,
      createdAt,
      metadata: '{}'
    })
    const reset = new Date(now.getTime() - 3 * DAY)
    await db.insert(globalSettings).values({
      key: SCHOOL_YEAR_START_KEY,
      value: {
        at: reset.toISOString()
      }
    })
    await db.insert(auditLogs).values([
      audit(new Date(reset.getTime() - 2 * DAY)),
      audit(new Date(reset.getTime() + DAY))
    ])
    try {
      await rollUpActiveUsers(now, 90)
      expect((await rows()).map(row => row.day)).toEqual([
        romeDay(new Date(reset.getTime() + DAY))
      ])
    }
    finally {
      await db.delete(globalSettings).where(eq(globalSettings.key, SCHOOL_YEAR_START_KEY))
    }
  })
})

describe('retention and reading', () => {
  it('deletes counts older than 13 months', async () => {
    const now = new Date('2026-06-15T12:00:00Z')
    expect(analyticsCutoffDay(now)).toBe('2025-05-15')
    const who = { role: 'student', year: 1 }
    await addCounts(who, [
      { event: 'bell_open', detail: '', count: 1 }
    ], new Date('2025-05-14T12:00:00Z'))
    await addCounts(who, [
      { event: 'bell_open', detail: '', count: 1 }
    ], new Date('2025-05-15T12:00:00Z'))
    expect(await deleteOldAnalytics(now)).toBe(1)
    expect((await rows()).map(row => row.day)).toEqual(['2025-05-15'])
  })

  it('is readable by admins only', async () => {
    await send(tokens.student, [
      { event: 'page_view', detail: '/student' }
    ])
    expect((await call('/admin/stats/analytics', { token: tokens.student })).status).toBe(403)
    const response = await call('/admin/stats/analytics?days=7', { token: tokens.admin })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.daily).toEqual([
      {
        day: romeDay(new Date()),
        event: 'page_view',
        role: 'student',
        count: 1
      }
    ])
    expect(body.byDetail).toEqual([
      { event: 'page_view', detail: '/student', count: 1 }
    ])
    expect(body.byGroup).toEqual([
      {
        event: 'page_view',
        role: 'student',
        year: 2,
        count: 1
      }
    ])
  })
})
