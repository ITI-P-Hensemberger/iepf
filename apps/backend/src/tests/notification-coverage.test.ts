// Purpose: Pin the kinds nobody can switch off, and that what goes by email also reaches the
// panel and the phone: presence, lesson hours, profile changes, presence still to mark.
import type { Buffer } from 'node:buffer'

import { eq, like } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MailPayload } from '@/lib/mailer'
import type { WebPushTarget } from '@/lib/web-push'

import app from '@/app'
import db, { closeDb } from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { notificationPreferences } from '@/db/schemas/notification-preferences.schema'
import { pushSubscriptions } from '@/db/schemas/push-subscriptions.schema'
import { reminderDeliveries } from '@/db/schemas/reminder-deliveries.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { getStudentTokenBalance } from '@/lib/lesson-tokens'
import { assertLocalDatabase } from '@/lib/local-database'
import { createMailBatch } from '@/lib/mail-batch'
import { remindMissingPresence } from '@/lib/missing-presence'
import { deliverPush, saveSubscription, setPushConfig, waitForPendingPush } from '@/lib/push'
import { createPushBatch } from '@/lib/reminder-delivery'
import { resetRateLimiters } from '@/middlewares/rate-limit'

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
const message = { title: 'T', body: 'B', url: '/' }

let pushes: Array<{ to: string, payload: Record<string, unknown> }>
let ids: Record<string, string>
const tokens: Record<string, string> = {}
let subjectId: string

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

function pushesTo(role: string) {
  return pushes.filter(push => push.to === role)
}

function mailsTo(role: string) {
  return mails.filter(mail => mail.to === `${role}@example.test`)
}

async function lessonWithBooking(startAt: Date, present: boolean | null = null) {
  const [lesson] = await db.insert(lessons).values({
    tutorId: ids.tutor,
    subjectId,
    startAt,
    durationMinutes: 60,
    seats: 2,
    status: 'confirmed'
  }).returning({ id: lessons.id })
  const [booking] = await db.insert(lessonBookings).values({
    lessonId: lesson.id,
    studentId: ids.student,
    subjectId,
    topic: 'Argomento',
    studentPresence: present
  }).returning({ id: lessonBookings.id })
  return { lessonId: lesson.id, bookingId: booking.id }
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  resetRateLimiters()
  for (const role of ['admin', 'tutor', 'student']) {
    const login = await call('/auth/login', {
      body: { email: `${role}@example.test`, password: DEV_PASSWORD }
    })
    tokens[role] = (await login.json()).accessToken
  }
  subjectId = (await db.query.subjects.findFirst())!.id
})

beforeEach(async () => {
  await waitForPendingPush()
  pushes = []
  mails.length = 0
  setPushConfig({
    publicKey: 'test-public-key',
    transport: async (target: WebPushTarget, payload: Buffer) => {
      pushes.push({
        to: target.endpoint.split('/').at(-1)!,
        payload: JSON.parse(payload.toString())
      })
      return { status: 201 }
    }
  })
  await db.delete(pushSubscriptions)
  await db.delete(notificationPreferences)
  await db.delete(reminderDeliveries).where(like(reminderDeliveries.key, '%'))
  for (const role of ['admin', 'tutor', 'student']) {
    await saveSubscription(ids[role], { endpoint: `https://fcm.googleapis.com/fcm/send/${role}`, p256dh: P256DH, auth: AUTH })
  }
})

afterAll(async () => {
  setPushConfig(null)
  await closeDb()
})

describe('always-on kinds', () => {
  it('reach a student who switched every kind off', async () => {
    const off = await call('/notifications/preferences', {
      token: tokens.student,
      method: 'PUT',
      body: {
        bookings: false,
        reminders: false,
        feedback: false,
        lessons: false,
        account: false
      }
    })
    expect(off.status).toBe(200)
    expect(await off.json()).not.toHaveProperty('account')

    expect(await deliverPush([ids.student], 'bookings', message)).toEqual({ delivered: 0, failed: 0 })
    expect(await deliverPush([ids.student], 'updates', message)).toEqual({ delivered: 1, failed: 0 })
    expect(await deliverPush([ids.student], 'account', message)).toEqual({ delivered: 1, failed: 0 })
  })

  it('reach an admin who switched the empty week off before it was always on', async () => {
    await db.insert(notificationPreferences).values({ userId: ids.admin, adminEmptyWeek: false })
    expect(await deliverPush([ids.admin], 'adminEmptyWeek', message)).toEqual({ delivered: 1, failed: 0 })
  })

  it('treat a booking canceled by an admin as news, one canceled by the student as theirs', async () => {
    const { lessonId, bookingId } = await lessonWithBooking(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000))
    const canceled = await call(`/lessons/${lessonId}/bookings/${bookingId}/cancel`, { token: tokens.admin, method: 'PATCH', body: {} })
    expect(canceled.status).toBe(200)
    await waitForPendingPush()
    expect(pushesTo('student').map(push => push.payload.category)).toEqual(['updates'])
    expect(pushesTo('tutor').map(push => push.payload.category)).toEqual(['updates'])

    pushes = []
    const own = await lessonWithBooking(new Date(Date.now() + 11 * 24 * 60 * 60 * 1000))
    await call(`/lessons/${own.lessonId}/bookings/${own.bookingId}/cancel`, { token: tokens.student, method: 'PATCH', body: {} })
    await waitForPendingPush()
    expect(pushesTo('student').map(push => push.payload.category)).toEqual(['bookings'])
    expect(pushesTo('tutor').map(push => push.payload.category)).toEqual(['bookings'])
  })
})

describe('presence', () => {
  it('tells the student by push as well as by email', async () => {
    const { lessonId, bookingId } = await lessonWithBooking(new Date(Date.now() - 30 * 60 * 1000))
    const marked = await call(`/lessons/${lessonId}/bookings/${bookingId}/presence`, {
      token: tokens.tutor,
      method: 'PATCH',
      body: { present: true }
    })
    expect(marked.status).toBe(200)
    await waitForPendingPush()
    expect(pushesTo('student').map(push => [push.payload.title, push.payload.category])).toEqual([
      ['Presenza confermata', 'updates']
    ])
    expect(mailsTo('student').map(mail => mail.subject)).toEqual(['Presenza confermata'])
  })

  it('reminds the tutor and tells the admins once, 20 minutes into the lesson', async () => {
    const startAt = new Date('2031-09-10T15:00:00')
    const unmarked = await lessonWithBooking(startAt)
    await lessonWithBooking(new Date('2031-09-10T14:00:00'), true)
    await lessonWithBooking(new Date('2031-09-10T15:10:00'))
    const run = async (now: Date) => {
      const batches = {
        mail: createMailBatch(),
        push: createPushBatch()
      }
      const found = await remindMissingPresence(batches, now)
      await batches.push.finish()
      await batches.mail.finish()
      return found
    }

    expect(await run(new Date('2031-09-10T15:19:00'))).toBe(0)
    expect(await run(new Date('2031-09-10T15:25:00'))).toBe(1)
    expect(pushesTo('tutor').map(push => [push.payload.title, push.payload.url])).toEqual([
      ['Presenze da segnare', `/tutor/lessons/${unmarked.lessonId}`]
    ])
    expect(pushesTo('admin').map(push => push.payload.title)).toEqual(['Presenze non segnate'])
    expect(mailsTo('tutor').map(mail => mail.subject)).toEqual(['Segna le presenze'])
    expect(mailsTo('admin').map(mail => mail.subject)).toEqual(['Presenze non segnate'])

    // The 15:10 lesson is due only from 15:30.
    await run(new Date('2031-09-10T15:29:00'))
    expect(pushesTo('tutor')).toHaveLength(1)
    expect(pushesTo('admin')).toHaveLength(1)
    expect(mails).toHaveLength(2)
  })

  it('follows the admin\'s switches for presence still to mark', async () => {
    await db.insert(notificationPreferences).values({ userId: ids.admin, emailAdminMissingPresence: false })
    await lessonWithBooking(new Date('2031-09-11T15:00:00'))
    const batches = {
      mail: createMailBatch(),
      push: createPushBatch()
    }
    await remindMissingPresence(batches, new Date('2031-09-11T15:30:00'))
    await batches.push.finish()
    await batches.mail.finish()
    expect(pushesTo('admin')).toHaveLength(1)
    expect(mailsTo('admin')).toHaveLength(0)
  })
})

describe('lesson hours', () => {
  it('tell the student when an admin changes them', async () => {
    const before = await getStudentTokenBalance(ids.student)
    const adjusted = await call(`/students/${ids.student}/tokens/adjust`, {
      token: tokens.admin,
      body: { delta: 2, reason: 'Recupero' }
    })
    expect(adjusted.status).toBe(200)
    await waitForPendingPush()
    expect(pushesTo('student').map(push => [push.payload.title, push.payload.category])).toEqual([
      ['Ore di lezione aggiunte', 'account']
    ])
    expect(String(pushesTo('student')[0].payload.body)).toContain(`Ore rimanenti: ${before + 2}.`)
    expect(mailsTo('student').map(mail => mail.subject)).toEqual(['Ore di lezione aggiunte'])
  })

  it('tell the student when a booking uses the last one', async () => {
    const balance = await getStudentTokenBalance(ids.student)
    await call(`/students/${ids.student}/tokens/adjust`, {
      token: tokens.admin,
      body: { delta: 1 - balance, reason: 'Prova' }
    })
    const startAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
    startAt.setHours(14, 0, 0, 0)
    const [lesson] = await db.insert(lessons).values({
      tutorId: ids.tutor,
      subjectId,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })
    await waitForPendingPush()
    pushes = []

    const booked = await call(`/lessons/${lesson.id}/book`, {
      token: tokens.student,
      body: { topic: 'Equazioni' }
    })
    expect(booked.status).toBe(201)
    await waitForPendingPush()
    expect(pushesTo('student').map(push => push.payload.title).sort()).toEqual(['Ore di lezione finite', 'Prenotazione confermata'])
  })
})

describe('profile changes by an admin', () => {
  it('reach the user by push, and a changed address hears it at the old one', async () => {
    const changed = await call(`/users/${ids.student}`, {
      token: tokens.admin,
      method: 'PATCH',
      body: { email: 'studente.nuovo@hensemberger.it' }
    })
    expect(changed.status).toBe(200)
    await waitForPendingPush()
    expect(pushesTo('student').map(push => [push.payload.title, push.payload.category])).toEqual([
      ['Profilo aggiornato', 'account']
    ])
    expect(mailsTo('student').map(mail => mail.subject)).toEqual(['Il tuo indirizzo email è stato cambiato'])
    expect(mailsTo('student')[0].text).toContain('studente.nuovo@hensemberger.it')
    await db.update(users).set({ email: 'student@example.test' }).where(eq(users.id, ids.student))
  })

  it('stay quiet towards users who edit their own name', async () => {
    const own = await call(`/users/${ids.tutor}`, {
      token: tokens.tutor,
      method: 'PATCH',
      body: { firstName: 'Tutor' }
    })
    expect(own.status).toBe(200)
    await waitForPendingPush()
    expect(pushesTo('tutor')).toHaveLength(0)
  })
})
