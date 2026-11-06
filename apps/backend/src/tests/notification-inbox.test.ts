// Purpose: Pin that every notification reaches the panel, whatever push says, and how it is read.
import { like } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { notificationPreferences } from '@/db/schemas/notification-preferences.schema'
import { notifications } from '@/db/schemas/notifications.schema'
import { reminderDeliveries } from '@/db/schemas/reminder-deliveries.schema'
import env from '@/env'
import { cleanUpExpiredData } from '@/lib/data-retention'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer, waitForPendingMail } from '@/lib/mailer'
import { KEEP_NOTIFICATIONS_DAYS } from '@/lib/notification-inbox'
import { notifyUsers, setPushConfig, waitForPendingPush } from '@/lib/push'
import { createPushBatch, sendReminderPushOnce } from '@/lib/reminder-delivery'
import { resetRateLimiters } from '@/middlewares/rate-limit'

const message = { title: 'Prenotazione confermata', body: 'Matematica, oggi alle 14:30', url: '/student/lessons' }

let ids: Record<string, string>
const tokens: Record<string, string> = {}

async function call(path: string, options: { token?: string, method?: string } = {}) {
  return app.request(path, {
    method: options.method ?? 'GET',
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : {}
  })
}

async function inbox(token: string, query = '') {
  const response = await call(`/notifications/inbox${query}`, { token })
  expect(response.status).toBe(200)
  return response.json() as Promise<{
    items: Array<{ id: string, title: string, body: string, url: string, category: string, readAt: string | null }>
    nextCursor: string | null
    unread: number
  }>
}

async function insertMany(userId: string, count: number, start = Date.now()) {
  await db.insert(notifications).values(Array.from({ length: count }, (_, index) => ({
    userId,
    category: 'bookings',
    title: `N${index}`,
    body: 'B',
    url: '/student/lessons',
    // Index 0 is the oldest; pairs share a timestamp to exercise the id tie-break.
    createdAt: new Date(start + Math.floor(index / 2) * 1000)
  })))
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  resetRateLimiters()
  for (const role of ['admin', 'tutor', 'student', 'activator']) {
    const login = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${role}@example.test`, password: DEV_PASSWORD })
    })
    tokens[role] = (await login.json()).accessToken
  }
})

beforeEach(async () => {
  setPushConfig(null)
  await db.delete(notifications)
  await db.delete(notificationPreferences)
  await db.delete(reminderDeliveries).where(like(reminderDeliveries.key, 'inbox:%'))
})

afterAll(async () => {
  await waitForPendingMail()
  closeMailer()
  await closeDb()
})

describe('recording', () => {
  it('keeps a notification even with push off and the kind switched off', async () => {
    await db.insert(notificationPreferences).values({ userId: ids.student, bookings: false })

    notifyUsers([ids.student, ids.student, ids.tutor], 'bookings', message)
    await waitForPendingPush()

    const student = await inbox(tokens.student)
    expect(student.items).toHaveLength(1)
    expect(student.items[0]).toMatchObject({ ...message, category: 'bookings', readAt: null })
    expect(student.unread).toBe(1)
    expect((await inbox(tokens.tutor)).items).toHaveLength(1)
  })

  it('records a reminder once, even when its job runs again', async () => {
    const batch = createPushBatch()
    expect(await sendReminderPushOnce(batch, 'feedback:2026-11-06:x', ids.student, 'feedback', message)).toBe(false)
    expect(await sendReminderPushOnce(batch, 'feedback:2026-11-06:x', ids.student, 'feedback', message)).toBe(false)
    await batch.finish()

    expect((await inbox(tokens.student)).items).toHaveLength(1)
  })
})

describe('reading', () => {
  it('pages newest first with no gaps or repeats', async () => {
    await insertMany(ids.student, 45)

    const first = await inbox(tokens.student)
    // N44 is alone in the newest instant; N42 and N43 share the next one, ordered by id.
    const [newest, tieA, tieB] = first.items
    expect(newest.title).toBe('N44')
    expect([tieA.title, tieB.title].sort()).toEqual(['N42', 'N43'])
    expect(tieA.id > tieB.id).toBe(true)
    expect(first.items).toHaveLength(20)
    expect(first.unread).toBe(45)

    // A notification arriving meanwhile does not shift the next pages.
    await insertMany(ids.student, 1, Date.now() + 3_600_000)

    const second = await inbox(tokens.student, `?cursor=${first.nextCursor}`)
    const third = await inbox(tokens.student, `?cursor=${second.nextCursor}`)
    expect(third.items).toHaveLength(5)
    expect(third.nextCursor).toBeNull()

    const titles = [...first.items, ...second.items, ...third.items].map(item => item.title)
    expect(new Set(titles).size).toBe(45)
  })

  it('rejects a cursor it did not issue', async () => {
    const response = await call('/notifications/inbox?cursor=nonsense', { token: tokens.student })
    expect(response.status).toBe(422)
  })

  it('shows each user only their own notifications', async () => {
    await insertMany(ids.tutor, 3)
    const student = await inbox(tokens.student)
    expect(student.items).toHaveLength(0)
    expect(student.unread).toBe(0)
  })

  it('marks one or all as read, only for their owner', async () => {
    await insertMany(ids.student, 3)
    const [newest] = (await inbox(tokens.student)).items

    expect((await call(`/notifications/inbox/${newest.id}/read`, { token: tokens.tutor, method: 'POST' })).status).toBe(204)
    expect((await inbox(tokens.student)).unread).toBe(3)

    expect((await call(`/notifications/inbox/${newest.id}/read`, { token: tokens.student, method: 'POST' })).status).toBe(204)
    const afterOne = await inbox(tokens.student)
    expect(afterOne.unread).toBe(2)
    expect(afterOne.items[0].readAt).not.toBeNull()

    const unread = await call('/notifications/inbox/unread', { token: tokens.student })
    expect(await unread.json()).toEqual({ count: 2 })

    expect((await call('/notifications/inbox/read-all', { token: tokens.student, method: 'POST' })).status).toBe(204)
    expect((await inbox(tokens.student)).unread).toBe(0)
  })

  it('lets an impersonating admin look without marking anything read', async () => {
    await insertMany(ids.student, 2)
    const impersonation = await app.request('/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokens.admin}` },
      body: JSON.stringify({ userId: ids.student })
    })
    const { token } = await impersonation.json()

    expect((await inbox(token)).items).toHaveLength(2)
    expect((await call('/notifications/inbox/read-all', { token, method: 'POST' })).status).toBe(204)
    expect((await inbox(tokens.student)).unread).toBe(2)
  })

  it('is not for activators', async () => {
    expect((await call('/notifications/inbox', { token: tokens.activator })).status).toBe(403)
    expect((await call('/notifications/inbox/unread', { token: tokens.activator })).status).toBe(403)
  })
})

describe('retention', () => {
  it('deletes notifications older than the panel keeps', async () => {
    const now = new Date()
    const day = 24 * 60 * 60 * 1000
    await insertMany(ids.student, 1, now.getTime() - (KEEP_NOTIFICATIONS_DAYS + 1) * day)
    await insertMany(ids.student, 1, now.getTime() - (KEEP_NOTIFICATIONS_DAYS - 1) * day)

    expect((await cleanUpExpiredData(now)).notifications).toBe(1)
    expect(await db.select().from(notifications)).toHaveLength(1)
  })
})
