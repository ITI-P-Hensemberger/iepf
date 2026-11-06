// Purpose: Pin which events reach admins, by push and by email, and when they stay quiet.
import type { Buffer } from 'node:buffer'

import { eq, like } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MailPayload } from '@/lib/mailer'
import type { WebPushTarget } from '@/lib/web-push'

import app from '@/app'
import db, { closeDb } from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { notificationPreferences } from '@/db/schemas/notification-preferences.schema'
import { pushSubscriptions } from '@/db/schemas/push-subscriptions.schema'
import { reminderDeliveries } from '@/db/schemas/reminder-deliveries.schema'
import { subjectRequests } from '@/db/schemas/subject-requests.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { sendAdminDigest } from '@/lib/admin-digest'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { hasOpenSchoolDay, notifyIfWeekEmpty } from '@/lib/empty-week'
import { assertLocalDatabase } from '@/lib/local-database'
import { createMailBatch } from '@/lib/mail-batch'
import { saveSubscription, setPushConfig, waitForPendingPush } from '@/lib/push'
import { createPushBatch, localDayKey } from '@/lib/reminder-delivery'
import { resetRateLimiters } from '@/middlewares/rate-limit'

// Emails are recorded instead of sent; the mail batch of the jobs goes through the same spy.
const mails: MailPayload[] = []
vi.mock('@/lib/mailer', () => ({
  sendMail: async (payload: MailPayload) => {
    mails.push(payload)
  },
  closeMailer: () => {},
  waitForPendingMail: async () => {}
}))

const P256DH = `BA${'A'.repeat(85)}`
const AUTH = 'AAAAAAAAAAAAAAAAAAAAAA'

let pushes: Array<{ endpoint: string, payload: Record<string, unknown> }>
let ids: Record<string, string>
const tokens: Record<string, string> = {}
let subjectId: string

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

function adminPushes() {
  return pushes.filter(push => push.endpoint.endsWith('/admin'))
}

function adminMails() {
  return mails.filter(mail => mail.to === 'admin@example.test')
}

async function settle() {
  await waitForPendingPush()
}

async function pastLessonWithBooking(present: boolean | null = true) {
  // Started half an hour ago: tutors may mark presence only within two hours of the start.
  const startAt = new Date(Date.now() - 30 * 60 * 1000)
  const [lesson] = await db.insert(lessons).values({ tutorId: ids.tutor, subjectId, startAt, durationMinutes: 60, seats: 2, status: 'confirmed' }).returning({ id: lessons.id })
  const [booking] = await db.insert(lessonBookings).values({ lessonId: lesson.id, studentId: ids.student, topic: 'Argomento', studentPresence: present }).returning({ id: lessonBookings.id })
  return { lessonId: lesson.id, bookingId: booking.id }
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  resetRateLimiters()
  for (const role of ['admin', 'tutor', 'student', 'activator']) {
    const login = await call('/auth/login', { body: { email: `${role}@example.test`, password: DEV_PASSWORD } })
    tokens[role] = (await login.json()).accessToken
  }
  subjectId = (await db.query.subjects.findFirst())!.id
})

beforeEach(async () => {
  // Nothing from the previous test may land in this one.
  await waitForPendingPush()
  pushes = []
  mails.length = 0
  setPushConfig({
    publicKey: 'test-public-key',
    transport: async (target: WebPushTarget, payload: Buffer) => {
      pushes.push({ endpoint: target.endpoint, payload: JSON.parse(payload.toString()) })
      return { status: 201 }
    }
  })
  await db.delete(pushSubscriptions)
  await db.delete(notificationPreferences)
  await db.delete(reminderDeliveries).where(like(reminderDeliveries.key, '%'))
  await saveSubscription(ids.admin, { endpoint: 'https://fcm.googleapis.com/fcm/send/admin', p256dh: P256DH, auth: AUTH })
})

afterAll(async () => {
  setPushConfig(null)
  await closeDb()
})

describe('who may subscribe', () => {
  it('lets admins in and keeps activators out', async () => {
    const body = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: P256DH, auth: AUTH } }
    expect((await call('/notifications/push/subscriptions', { token: tokens.admin, body })).status).toBe(204)
    expect((await call('/notifications/push/subscriptions', { token: tokens.activator, body })).status).toBe(403)
  })
})

describe('low feedback', () => {
  it('tells admins about a low rating from a student, by push and by email', async () => {
    const { lessonId, bookingId } = await pastLessonWithBooking()
    const response = await call(`/lessons/${lessonId}/feedback`, { token: tokens.student, body: { bookingId, rating: 2 } })
    expect(response.status).toBe(200)
    await settle()

    expect(adminPushes().map(push => push.payload.title)).toEqual(['Feedback basso da uno studente'])
    expect(JSON.stringify(adminPushes())).not.toContain('Demo')
    expect(adminMails()).toHaveLength(1)
    expect(adminMails()[0].subject).toBe('Feedback basso da uno studente')
    expect(adminMails()[0].text).toContain('ha dato 2/5 al tutor Demo tutor')
  })

  it('names the other direction when the tutor rates the student', async () => {
    const { lessonId, bookingId } = await pastLessonWithBooking()
    await call(`/lessons/${lessonId}/feedback`, { token: tokens.tutor, body: { bookingId, rating: 1, text: 'Non si è presentato preparato' } })
    await settle()

    expect(adminPushes().map(push => push.payload.title)).toEqual(['Feedback basso da un tutor'])
    expect(adminMails()[0].text).toContain('Il tutor Demo tutor ha dato 1/5 a Demo student')
    expect(adminMails()[0].text).not.toContain('preparato')
  })

  it('stays quiet above 2, and speaks when an edit drops the rating', async () => {
    const { lessonId, bookingId } = await pastLessonWithBooking()
    // Only tutors and admins edit feedback.
    const created = await call(`/lessons/${lessonId}/feedback`, { token: tokens.tutor, body: { bookingId, rating: 4, text: 'Bene' } })
    await settle()
    expect(adminPushes()).toHaveLength(0)

    const { id } = await created.json()
    expect((await call(`/lessons/${lessonId}/feedback/${id}`, { token: tokens.tutor, method: 'PATCH', body: { rating: 1 } })).status).toBe(200)
    await settle()
    expect(adminPushes()).toHaveLength(1)

    await call(`/lessons/${lessonId}/feedback/${id}`, { token: tokens.tutor, method: 'PATCH', body: { rating: 2 } })
    await settle()
    expect(adminPushes()).toHaveLength(1)
    await db.delete(lessonFeedback).where(eq(lessonFeedback.lessonId, lessonId))
  })

  it('follows each admin\'s channels', async () => {
    await call('/notifications/preferences', { token: tokens.admin, method: 'PUT', body: { emailAdminLowFeedback: false } })
    const { lessonId, bookingId } = await pastLessonWithBooking()
    await call(`/lessons/${lessonId}/feedback`, { token: tokens.student, body: { bookingId, rating: 1 } })
    await settle()
    expect(adminPushes()).toHaveLength(1)
    expect(adminMails()).toHaveLength(0)

    await call('/notifications/preferences', { token: tokens.admin, method: 'PUT', body: { adminLowFeedback: false, emailAdminLowFeedback: true } })
    const other = await pastLessonWithBooking()
    await call(`/lessons/${other.lessonId}/feedback`, { token: tokens.student, body: { bookingId: other.bookingId, rating: 1 } })
    await settle()
    expect(adminPushes()).toHaveLength(1)
    expect(adminMails()).toHaveLength(1)
  })
})

describe('absences', () => {
  it('report every absence once', async () => {
    const { lessonId, bookingId } = await pastLessonWithBooking(null)
    const presence = (present: boolean) => call(`/lessons/${lessonId}/bookings/${bookingId}/presence`, { token: tokens.tutor, method: 'PATCH', body: { present } })

    expect((await presence(false)).status).toBe(200)
    await settle()
    expect(adminPushes().map(push => push.payload.title)).toEqual(['Assenza segnata'])
    expect(adminMails()[0].text).toContain('Demo student')

    await presence(false)
    await settle()
    expect(adminPushes()).toHaveLength(1)

    await presence(true)
    await presence(false)
    await settle()
    expect(adminPushes()).toHaveLength(2)
  })
})

describe('late cancellations', () => {
  it('report a student canceling on the day of the lesson', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2031-09-10T09:00:00') })
    try {
      const [lesson] = await db.insert(lessons).values({ tutorId: ids.tutor, subjectId, startAt: new Date('2031-09-10T15:00:00'), durationMinutes: 60, seats: 2, status: 'confirmed' }).returning({ id: lessons.id })
      const [booking] = await db.insert(lessonBookings).values({ lessonId: lesson.id, studentId: ids.student, topic: 'Argomento' }).returning({ id: lessonBookings.id })
      // A token issued now would already be expired at the faked date.
      resetRateLimiters()
      const login = await call('/auth/login', { body: { email: 'student@example.test', password: DEV_PASSWORD } })
      const { accessToken } = await login.json()
      const response = await call(`/lessons/${lesson.id}/bookings/${booking.id}/cancel`, { token: accessToken, method: 'PATCH', body: {} })
      expect(response.status).toBe(200)
      await settle()
    }
    finally {
      vi.useRealTimers()
    }
    expect(adminPushes().map(push => push.payload.title)).toEqual(['Annullamento all\'ultimo momento'])
    expect(adminMails().map(mail => mail.subject)).toEqual(['Annullamento all\'ultimo momento'])
  })

  it('say nothing about a cancellation days ahead', async () => {
    const [lesson] = await db.insert(lessons).values({ tutorId: ids.tutor, subjectId, startAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), durationMinutes: 60, seats: 2, status: 'confirmed' }).returning({ id: lessons.id })
    const [booking] = await db.insert(lessonBookings).values({ lessonId: lesson.id, studentId: ids.student, topic: 'Argomento' }).returning({ id: lessonBookings.id })
    await call(`/lessons/${lesson.id}/bookings/${booking.id}/cancel`, { token: tokens.student, method: 'PATCH', body: {} })
    await settle()
    expect(adminPushes()).toHaveLength(0)
  })
})

describe('empty week', () => {
  const monday = new Date('2032-03-01T00:00:00')
  const batches = () => ({ mail: createMailBatch(), push: createPushBatch() })

  function weekDays(count: number) {
    return new Set(Array.from({ length: count }, (_, offset) => {
      const day = new Date(monday)
      day.setDate(monday.getDate() + offset)
      return localDayKey(day)
    }))
  }

  it('knows a week closed on every school day', () => {
    expect(hasOpenSchoolDay(monday, weekDays(5))).toBe(false)
    expect(hasOpenSchoolDay(monday, weekDays(4))).toBe(true)
    expect(hasOpenSchoolDay(monday, new Set())).toBe(true)
  })

  it('warns once about a week with open days and no lessons', async () => {
    const first = batches()
    expect(await notifyIfWeekEmpty(first, monday, weekDays(2))).toBe(true)
    await first.push.finish()
    await first.mail.finish()
    expect(adminPushes().map(push => push.payload.title)).toEqual(['Nessuna lezione generata'])
    expect(adminMails()).toHaveLength(1)

    const rerun = batches()
    await notifyIfWeekEmpty(rerun, monday, weekDays(2))
    await rerun.push.finish()
    await rerun.mail.finish()
    expect(adminPushes()).toHaveLength(1)
    expect(adminMails()).toHaveLength(1)
  })

  it('says nothing for a closed week or one that has lessons', async () => {
    expect(await notifyIfWeekEmpty(batches(), monday, weekDays(5))).toBe(false)
    await db.insert(lessons).values({ tutorId: ids.tutor, subjectId, startAt: new Date('2032-03-03T14:00:00'), durationMinutes: 60, seats: 2 })
    expect(await notifyIfWeekEmpty(batches(), monday, new Set())).toBe(false)
    expect(adminPushes()).toHaveLength(0)
  })
})

describe('daily digest', () => {
  async function addAdmin(email: string, isActive: boolean, deactivatedAt: Date | null = null) {
    const [admin] = await db.insert(users).values({ email, firstName: 'Nuovo', lastName: 'Admin', passwordHash: 'unused', role: 'admin' }).returning({ id: users.id })
    await db.insert(adminProfiles).values({ userId: admin.id, isActive, deactivatedAt })
    return admin.id
  }

  async function runDigest(now = new Date()) {
    const run = { mail: createMailBatch(), push: createPushBatch() }
    const found = await sendAdminDigest(run, now)
    await run.push.finish()
    await run.mail.finish()
    return found
  }

  it('lists admins still waiting, not those switched off by hand, once a day', async () => {
    await addAdmin('waiting@example.test', false)
    await addAdmin('switched-off@example.test', false, new Date())

    expect(await runDigest()).toMatchObject({ pendingAdmins: 1 })
    expect(adminPushes().map(push => push.payload.body)).toEqual(['Un admin ha accettato l\'invito e aspetta l\'attivazione.'])
    expect(adminMails()[0].text).toContain('waiting@example.test')
    expect(adminMails()[0].text).not.toContain('switched-off@example.test')

    await runDigest()
    expect(adminPushes()).toHaveLength(1)
    await db.delete(users).where(eq(users.email, 'waiting@example.test'))
  })

  it('marks an admin switched off through the API as no longer waiting', async () => {
    const otherId = await addAdmin('colleague@example.test', true)
    const response = await call(`/users/${otherId}`, { token: tokens.admin, method: 'PATCH', body: { isActive: false } })
    expect(response.status).toBe(200)
    const [profile] = await db.select().from(adminProfiles).where(eq(adminProfiles.userId, otherId))
    expect(profile.deactivatedAt).not.toBeNull()
  })

  it('sums up the subject requests of the last day', async () => {
    const now = new Date()
    const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000)
    await db.insert(subjectRequests).values([
      { studentId: ids.student, subjectId, createdAt: hoursAgo(2) },
      { studentId: ids.student, subjectId, createdAt: hoursAgo(3) },
      { studentId: ids.student, subjectId, createdAt: hoursAgo(50) },
      // Left to the database default: a request of a moment ago counts too.
      { studentId: ids.student, subjectId }
    ])

    expect(await runDigest(now)).toMatchObject({ subjectRequests: 1 })
    expect(adminPushes().find(push => push.payload.title === 'Nuove richieste di materie')?.payload.body).toBe('Matematica demo (3)')
    expect(adminMails().find(mail => mail.subject === 'Nuove richieste di materie')?.text).toContain('Matematica demo: 3 (4 in totale)')
  })
})
