// Purpose: Pin the lesson chat: only the booking's student and the lesson's tutor write, only until the
// lesson ends or is canceled; afterwards the chat stays readable; organizers read and never write.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonMessages } from '@/db/schemas/lesson-messages.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { notifications } from '@/db/schemas/notifications.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer } from '@/lib/mailer'
import { waitForPendingPush } from '@/lib/push'
import { resetRateLimiters } from '@/middlewares/rate-limit'

// From the dev seed: a confirmed lesson tomorrow and the demo student's booking on it.
const LESSON_ID = '00000000-0000-4000-8000-000000000102'
const BOOKING_ID = '00000000-0000-4000-8000-000000000104'
const CHAT = `/lessons/${LESSON_ID}/bookings/${BOOKING_ID}/messages`

const tokens: Record<string, string> = {}
const ids: Record<string, string> = {}
let startAt: Date

async function call(path: string, options: { token?: string, method?: string, body?: unknown } = {}) {
  return app.request(path, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  await seedDevelopmentData()
  resetRateLimiters()
  for (const role of ['admin', 'activator', 'tutor', 'student']) {
    const login = await call('/auth/login', { body: { email: `${role}@example.test`, password: DEV_PASSWORD } })
    tokens[role] = (await login.json()).accessToken
    ids[role] = (await db.query.users.findFirst({ where: (fields, ops) => ops.eq(fields.email, `${role}@example.test`) }))!.id
  }
  startAt = (await db.query.lessons.findFirst({ where: eq(lessons.id, LESSON_ID) }))!.startAt
})

beforeEach(async () => {
  await db.delete(lessonMessages)
  await db.delete(notifications)
  await db.update(lessons).set({ status: 'confirmed', startAt }).where(eq(lessons.id, LESSON_ID))
  await db.update(lessonBookings).set({ status: 'confirmed' }).where(eq(lessonBookings.id, BOOKING_ID))
})

afterAll(async () => {
  closeMailer()
  await closeDb()
})

describe('lesson chat', () => {
  it('lets the student and the tutor talk from the booking on', async () => {
    const sent = await call(CHAT, { token: tokens.student, body: { body: '  Non ho capito l\'argomento  ' } })
    expect(sent.status).toBe(201)
    expect(await sent.json()).toMatchObject({ mine: true, senderRole: 'student', body: 'Non ho capito l\'argomento' })
    expect((await call(CHAT, { token: tokens.tutor, body: { body: 'Te lo spiego domani.' } })).status).toBe(201)

    const chat = await (await call(CHAT, { token: tokens.tutor })).json()
    expect(chat.open).toBe(true)
    expect(chat.messages.map((m: { senderRole: string, mine: boolean }) => [m.senderRole, m.mine])).toEqual([['student', false], ['tutor', true]])
  })

  it('keeps everyone else out and never lets the organizers write', async () => {
    expect((await call(CHAT)).status).toBe(401)
    expect((await call(CHAT, { token: tokens.activator })).status).toBe(403)
    expect((await call(CHAT, { token: tokens.admin })).status).toBe(200)
    expect((await call(CHAT, { token: tokens.admin, body: { body: 'Ciao' } })).status).toBe(403)
    // A booking id under another lesson is not this chat.
    expect((await call(`/lessons/00000000-0000-4000-8000-000000000103/bookings/${BOOKING_ID}/messages`, { token: tokens.student })).status).toBe(404)
  })

  it('closes when the lesson ends and stays readable', async () => {
    await call(CHAT, { token: tokens.student, body: { body: 'Prima della lezione' } })
    await db.update(lessons).set({ startAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }).where(eq(lessons.id, LESSON_ID))

    for (const role of ['student', 'tutor']) {
      const refused = await call(CHAT, { token: tokens[role], body: { body: 'Dopo' } })
      expect(refused.status).toBe(409)
      const chat = await (await call(CHAT, { token: tokens[role] })).json()
      expect(chat.open).toBe(false)
      expect(chat.messages).toHaveLength(1)
    }
  })

  it('closes when the lesson or the booking is canceled', async () => {
    await db.update(lessons).set({ status: 'canceled' }).where(eq(lessons.id, LESSON_ID))
    expect((await call(CHAT, { token: tokens.tutor, body: { body: 'Ciao' } })).status).toBe(409)
    await db.update(lessons).set({ status: 'confirmed' }).where(eq(lessons.id, LESSON_ID))
    await db.update(lessonBookings).set({ status: 'canceled' }).where(eq(lessonBookings.id, BOOKING_ID))
    expect((await call(CHAT, { token: tokens.student, body: { body: 'Ciao' } })).status).toBe(409)
  })

  it('counts unread messages and notifies only the first one', async () => {
    for (const body of ['Uno', 'Due', 'Tre']) {
      await call(CHAT, { token: tokens.student, body: { body } })
    }
    await waitForPendingPush()
    const bell = await db.select().from(notifications).where(eq(notifications.userId, ids.tutor))
    expect(bell).toHaveLength(1)
    expect(bell[0]).toMatchObject({ title: 'Nuovo messaggio', url: `/tutor/lessons/${LESSON_ID}?chat=${BOOKING_ID}` })
    // The lock screen never shows what was written.
    expect(bell[0]!.body).not.toContain('Uno')

    expect(await (await call('/lesson-messages/unread', { token: tokens.tutor })).json()).toEqual([{ bookingId: BOOKING_ID, count: 3 }])
    expect(await (await call('/lesson-messages/unread', { token: tokens.student })).json()).toEqual([])

    // An organizer reading leaves them unread; the tutor reading clears them.
    expect((await call(`${CHAT}/read`, { token: tokens.admin, method: 'POST' })).status).toBe(204)
    expect(await (await call('/lesson-messages/unread', { token: tokens.tutor })).json()).toHaveLength(1)
    expect((await call(`${CHAT}/read`, { token: tokens.tutor, method: 'POST' })).status).toBe(204)
    expect(await (await call('/lesson-messages/unread', { token: tokens.tutor })).json()).toEqual([])

    // Once read, the next message notifies again.
    await call(CHAT, { token: tokens.student, body: { body: 'Quattro' } })
    await waitForPendingPush()
    expect(await db.select().from(notifications).where(eq(notifications.userId, ids.tutor))).toHaveLength(2)
  })

  it('refuses empty, too long and rude messages', async () => {
    expect((await call(CHAT, { token: tokens.student, body: { body: '   ' } })).status).toBe(422)
    expect((await call(CHAT, { token: tokens.student, body: { body: 'a'.repeat(2_001) } })).status).toBe(422)
    expect((await call(CHAT, { token: tokens.student, body: { body: 'sei uno stronzo' } })).status).toBe(400)
  })

  it('goes with the booking', async () => {
    await call(CHAT, { token: tokens.student, body: { body: 'Ciao' } })
    await db.delete(lessonBookings).where(eq(lessonBookings.id, BOOKING_ID))
    expect(await db.select().from(lessonMessages)).toEqual([])
  })
})
