// Purpose: Pin who can subscribe to push, what each user receives and how dead devices go away.
import type { Buffer } from 'node:buffer'

import { eq, like } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { WebPushTarget, WebPushTransport } from '@/lib/web-push'

import app from '@/app'
import db, { closeDb } from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { notificationPreferences } from '@/db/schemas/notification-preferences.schema'
import { notifications } from '@/db/schemas/notifications.schema'
import { pushSubscriptions } from '@/db/schemas/push-subscriptions.schema'
import { reminderDeliveries } from '@/db/schemas/reminder-deliveries.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { buildPushSetupLinkMessage } from '@/lib/email-templates'
import { notifyStudentsOfNewLessons } from '@/lib/lessons-available'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer, waitForPendingMail } from '@/lib/mailer'
import { deleteStaleSubscriptions, deliverPush, MAX_SUBSCRIPTIONS_PER_USER, notifyUsers, saveSubscription, setPushConfig, STALE_SUBSCRIPTION_DAYS, waitForPendingPush } from '@/lib/push'
import { lessonAssignedPush, lessonChangedPush, lessonReassignedPush } from '@/lib/push-messages'
import { createPushBatch, sendReminderPushOnce } from '@/lib/reminder-delivery'
import { isAllowedPushEndpoint, isValidSubscriptionKeys, isValidVapidSubject } from '@/lib/web-push'
import { resetRateLimiters } from '@/middlewares/rate-limit'

// A real browser key pair shape: 65-byte uncompressed point and 16-byte secret.
const P256DH = `BA${'A'.repeat(85)}`
const AUTH = 'AAAAAAAAAAAAAAAAAAAAAA'
const message = { title: 'T', body: 'B', url: '/student/lessons' }

let sent: Array<{ target: WebPushTarget, payload: Record<string, unknown> }>
let nextStatus: (target: WebPushTarget) => number

const transport: WebPushTransport = async (target, payload: Buffer) => {
  sent.push({
    target,
    payload: JSON.parse(payload.toString())
  })
  return {
    status: nextStatus(target)
  }
}

let ids: Record<string, string>
const tokens: Record<string, string> = {}

function endpoint(name: string) {
  return `https://fcm.googleapis.com/fcm/send/${name}`
}

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

function subscribe(token: string, name: string, keys = { p256dh: P256DH, auth: AUTH }) {
  return call('/notifications/push/subscriptions', {
    token,
    body: {
      endpoint: endpoint(name),
      keys
    }
  })
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  resetRateLimiters()
  for (const role of [
    'admin',
    'tutor',
    'student',
    'activator'
  ]) {
    const login = await call('/auth/login', {
      body: { email: `${role}@example.test`, password: DEV_PASSWORD }
    })
    tokens[role] = (await login.json()).accessToken
  }
})

beforeEach(async () => {
  sent = []
  nextStatus = () => 201
  setPushConfig({ publicKey: 'test-public-key', transport })
  await db.delete(pushSubscriptions)
  await db.delete(notificationPreferences)
  await db.delete(reminderDeliveries).where(like(reminderDeliveries.key, 'push:%'))
})

afterAll(async () => {
  setPushConfig(null)
  await waitForPendingMail()
  closeMailer()
  await closeDb()
})

describe('push endpoint checks', () => {
  it('accepts only https endpoints of known push services', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true)
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
    expect(isAllowedPushEndpoint('https://web.push.apple.com/x')).toBe(true)
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://127.0.0.1/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.test/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false)
    expect(isAllowedPushEndpoint('not a url')).toBe(false)
  })

  it('refuses VAPID subjects that Apple rejects', () => {
    expect(isValidVapidSubject('mailto:iepf@hensemberger.it')).toBe(true)
    expect(isValidVapidSubject('https://iepf.hensemberger.it')).toBe(true)
    expect(isValidVapidSubject('mailto:no-reply@example.test')).toBe(false)
    expect(isValidVapidSubject('mailto:someone@example.com')).toBe(false)
    expect(isValidVapidSubject('https://localhost')).toBe(false)
    expect(isValidVapidSubject('iepf@hensemberger.it')).toBe(false)
  })

  it('checks the size of the subscription keys', () => {
    expect(isValidSubscriptionKeys(P256DH, AUTH)).toBe(true)
    expect(isValidSubscriptionKeys(P256DH.slice(0, 40), AUTH)).toBe(false)
    expect(isValidSubscriptionKeys(P256DH, 'short')).toBe(false)
  })
})

describe('subscriptions', () => {
  it('reports whether push is configured', async () => {
    const response = await call('/notifications/push/config', { token: tokens.student })
    expect(await response.json()).toEqual({ enabled: true, publicKey: 'test-public-key' })

    setPushConfig(null)
    const off = await call('/notifications/push/config', { token: tokens.student })
    expect(await off.json()).toEqual({ enabled: false, publicKey: null })
    expect((await subscribe(tokens.student, 'off')).status).toBe(503)
  })

  it('saves a device and moves it to whoever subscribes it next', async () => {
    expect((await subscribe(tokens.student, 'same-device')).status).toBe(204)
    expect((await subscribe(tokens.tutor, 'same-device')).status).toBe(204)

    const rows = await db.select().from(pushSubscriptions)
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(ids.tutor)
  })

  it('refuses unknown push services and malformed keys', async () => {
    const internal = await call('/notifications/push/subscriptions', {
      token: tokens.student,
      body: {
        endpoint: 'https://169.254.169.254/latest',
        keys: { p256dh: P256DH, auth: AUTH }
      }
    })
    expect(internal.status).toBe(422)
    expect((await subscribe(tokens.student, 'bad-keys', { p256dh: 'abc', auth: AUTH })).status).toBe(422)
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0)
  })

  it('is not for activators, nor for anyone being impersonated', async () => {
    expect((await subscribe(tokens.activator, 'activator')).status).toBe(403)
    expect((await call('/notifications/push/subscriptions', {
      body: {
        endpoint: endpoint('x'),
        keys: { p256dh: P256DH, auth: AUTH }
      }
    })).status).toBe(401)

    const impersonation = await call('/admin/impersonate', {
      token: tokens.admin,
      body: { userId: ids.student }
    })
    expect(impersonation.status).toBe(200)
    const { token } = await impersonation.json()
    expect((await subscribe(token, 'impersonated')).status).toBe(403)
    expect((await call('/notifications/preferences', {
      token,
      method: 'PUT',
      body: { reminders: false }
    })).status).toBe(403)
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0)
  })

  it('keeps only the newest devices of a user', async () => {
    for (let index = 0; index <= MAX_SUBSCRIPTIONS_PER_USER; index++) {
      await subscribe(tokens.student, `device-${index}`)
    }
    const rows = await db.select().from(pushSubscriptions)
    expect(rows).toHaveLength(MAX_SUBSCRIPTIONS_PER_USER)
    expect(rows.map(row => row.endpoint)).not.toContain(endpoint('device-0'))
  })

  it('removes only the current user\'s device', async () => {
    await subscribe(tokens.student, 'mine')
    await call('/notifications/push/subscriptions', {
      token: tokens.tutor,
      method: 'DELETE',
      body: {
        endpoint: endpoint('mine')
      }
    })
    expect(await db.select().from(pushSubscriptions)).toHaveLength(1)

    const removed = await call('/notifications/push/subscriptions', {
      token: tokens.student,
      method: 'DELETE',
      body: {
        endpoint: endpoint('mine')
      }
    })
    expect(removed.status).toBe(204)
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0)
  })
})

describe('logout', () => {
  it('keeps the device subscribed: students use their own phones', async () => {
    const login = await call('/auth/login', {
      body: { email: 'student@example.test', password: DEV_PASSWORD }
    })
    const { accessToken, refreshToken } = await login.json()
    await subscribe(accessToken, 'own-phone')

    expect((await call('/auth/logout', {
      body: { refreshToken }
    })).status).toBe(204)
    expect(await deliverPush([ids.student], 'bookings', message)).toEqual({ delivered: 1, failed: 0 })
  })
})

describe('preferences', () => {
  it('starts with every kind enabled and changes one at a time', async () => {
    const initial = await call('/notifications/preferences', { token: tokens.student })
    expect(await initial.json()).toMatchObject({
      bookings: true,
      reminders: true,
      feedback: true,
      lessons: true,
      adminLowFeedback: true,
      emailAdminLowFeedback: true,
      adminMissingPresence: true
    })

    const updated = await call('/notifications/preferences', {
      token: tokens.student,
      method: 'PUT',
      body: { reminders: false }
    })
    expect(await updated.json()).toMatchObject({ reminders: false, bookings: true })
    const again = await call('/notifications/preferences', {
      token: tokens.student,
      method: 'PUT',
      body: { feedback: false }
    })
    expect(await again.json()).toMatchObject({ reminders: false, feedback: false })
  })
})

describe('delivery', () => {
  it('sends to every device of the user, unless they turned that kind off', async () => {
    await subscribe(tokens.student, 'phone')
    await subscribe(tokens.student, 'laptop')

    expect(await deliverPush([ids.student], 'reminders', message)).toEqual({ delivered: 2, failed: 0 })
    expect(sent.map(({ target }) => target.endpoint).sort()).toEqual([
      endpoint('laptop'),
      endpoint('phone')
    ])
    expect(sent[0].payload).toEqual({ ...message, category: 'reminders', badge: 0 })

    await call('/notifications/preferences', {
      token: tokens.student,
      method: 'PUT',
      body: { reminders: false }
    })
    sent = []
    expect(await deliverPush([ids.student], 'reminders', message)).toEqual({ delivered: 0, failed: 0 })
    expect(await deliverPush([ids.student], 'bookings', message)).toEqual({ delivered: 2, failed: 0 })
  })

  it('deletes devices the push service no longer knows', async () => {
    await subscribe(tokens.student, 'gone')
    await subscribe(tokens.student, 'expired')
    await subscribe(tokens.student, 'alive')
    nextStatus = target => target.endpoint.endsWith('gone')
      ? 410
      : target.endpoint.endsWith('expired')
        ? 404
        : 201

    expect(await deliverPush([ids.student], 'bookings', message)).toEqual({ delivered: 1, failed: 0 })
    const rows = await db.select().from(pushSubscriptions)
    expect(rows.map(row => row.endpoint)).toEqual([
      endpoint('alive')
    ])
    expect(rows[0].lastSuccessAt).not.toBeNull()
  })

  it('keeps a device after a temporary failure and never throws', async () => {
    await subscribe(tokens.student, 'busy')
    nextStatus = () => 503
    expect(await deliverPush([ids.student], 'bookings', message)).toEqual({ delivered: 0, failed: 1 })
    expect(await db.select().from(pushSubscriptions)).toHaveLength(1)
  })

  it('does nothing when push is not configured', async () => {
    await subscribe(tokens.student, 'phone')
    setPushConfig(null)
    expect(await deliverPush([ids.student], 'bookings', message)).toEqual({ delivered: 0, failed: 0 })
    expect(sent).toHaveLength(0)
  })

  it('tells the tutor when an admin adds a lesson', async () => {
    await subscribe(tokens.tutor, 'tutor-phone')
    const [subject] = await db.query.subjects.findMany({ limit: 1 })
    const created = await call('/lessons', {
      token: tokens.admin,
      body: {
        tutorId: ids.tutor,
        subjectId: subject.id,
        startAt: '2031-05-06T12:00:00.000Z',
        durationMinutes: 60
      }
    })
    expect(created.status).toBe(201)
    await waitForPendingPush()

    expect(sent).toHaveLength(1)
    expect(sent[0].payload).toMatchObject({ title: 'Nuova lezione assegnata', url: `/tutor/lessons/${(await created.json()).lessonId}` })
    expect(String(sent[0].payload.body)).toContain('Matematica demo')
  })

  it('tells the student and the tutor when a booking is canceled, without names', async () => {
    await subscribe(tokens.student, 'student-phone')
    await subscribe(tokens.tutor, 'tutor-phone')
    const canceled = await call('/lessons/00000000-0000-4000-8000-000000000102/bookings/00000000-0000-4000-8000-000000000104/cancel', {
      token: tokens.student,
      method: 'PATCH',
      body: {}
    })
    expect(canceled.status).toBe(200)
    await waitForPendingPush()

    expect(sent.map(({ target }) => target.endpoint).sort()).toEqual([
      endpoint('student-phone'),
      endpoint('tutor-phone')
    ])
    for (const { payload } of sent) {
      expect(payload.title).toBe('Prenotazione annullata')
      expect(JSON.stringify(payload)).not.toContain('Demo')
      expect(JSON.stringify(payload)).not.toContain('Equazioni')
    }
  })
})

describe('app icon badge', () => {
  it('sends each user their own unread count, the new notification included', async () => {
    await db.delete(notifications)
    await subscribe(tokens.student, 'student-phone')
    await subscribe(tokens.tutor, 'tutor-phone')
    await db.insert(notifications).values([
      {
        userId: ids.student,
        category: 'bookings',
        title: 'Old',
        body: 'B',
        url: '/'
      },
      {
        userId: ids.student,
        category: 'bookings',
        title: 'Read',
        body: 'B',
        url: '/',
        readAt: new Date()
      }
    ])

    notifyUsers([ids.student, ids.tutor], 'bookings', message)
    await waitForPendingPush()

    const badges = Object.fromEntries(sent.map(item => [item.target.endpoint, item.payload.badge]))
    expect(badges).toEqual({ [endpoint('student-phone')]: 2, [endpoint('tutor-phone')]: 1 })
    expect(sent[0].payload).toMatchObject(message)
    await db.delete(notifications)
  })
})

describe('reminder pushes', () => {
  it('go out once per key, apart from the email claim', async () => {
    await subscribe(tokens.student, 'phone')
    const first = createPushBatch()
    expect(await sendReminderPushOnce(first, 'lessons-today:x:booking:1', ids.student, 'reminders', message)).toBe(true)
    await first.finish()

    const rerun = createPushBatch()
    expect(await sendReminderPushOnce(rerun, 'lessons-today:x:booking:1', ids.student, 'reminders', message)).toBe(false)
    await rerun.finish()

    expect(sent).toHaveLength(1)
    const keys = await db.select().from(reminderDeliveries).where(like(reminderDeliveries.key, '%booking:1'))
    // The panel entry has its own claim, so it is never repeated by a push retry.
    expect(keys.map(row => row.key).sort()).toEqual(['inbox:lessons-today:x:booking:1', 'push:lessons-today:x:booking:1'])
  })

  it('give the claim back when no device could be reached', async () => {
    await subscribe(tokens.student, 'phone')
    nextStatus = () => 500
    const failing = createPushBatch()
    await sendReminderPushOnce(failing, 'retry', ids.student, 'reminders', message)
    expect(await failing.finish()).toEqual({ delivered: 0, failed: 1 })

    nextStatus = () => 201
    const rerun = createPushBatch()
    expect(await sendReminderPushOnce(rerun, 'retry', ids.student, 'reminders', message)).toBe(true)
    expect(await rerun.finish()).toEqual({ delivered: 1, failed: 0 })
  })

  it('claim nothing when push is not configured', async () => {
    setPushConfig(null)
    expect(await sendReminderPushOnce(createPushBatch(), 'off', ids.student, 'reminders', message)).toBe(false)
    expect(await db.select().from(reminderDeliveries).where(eq(reminderDeliveries.key, 'push:off'))).toHaveLength(0)
  })
})

describe('retention', () => {
  it('deletes devices silent for months', async () => {
    await subscribe(tokens.student, 'old')
    await subscribe(tokens.student, 'recent')
    const longAgo = new Date(Date.now() - (STALE_SUBSCRIPTION_DAYS + 1) * 24 * 60 * 60 * 1000)
    await db.update(pushSubscriptions).set({ updatedAt: longAgo }).where(eq(pushSubscriptions.endpoint, endpoint('old')))

    expect(await deleteStaleSubscriptions()).toBe(1)
    const rows = await db.select().from(pushSubscriptions)
    expect(rows.map(row => row.endpoint)).toEqual([
      endpoint('recent')
    ])
  })
})

describe('reschedule texts', () => {
  const before = {
    lessonId: 'old',
    subjectName: 'Matematica',
    startAt: new Date('2031-05-06T12:00:00Z'),
    durationMinutes: 60
  }

  it('name the one thing that changed', () => {
    expect(lessonChangedPush('student', before, {
      ...before,
      lessonId: 'new',
      startAt: new Date('2031-05-07T13:00:00Z')
    }, false)?.title).toBe('Lezione spostata')
    expect(lessonChangedPush('student', before, { ...before, durationMinutes: 90 }, false)).toMatchObject({
      title: 'Durata cambiata',
      body: expect.stringContaining('90 minuti')
    })
    expect(lessonChangedPush('student', before, { ...before, subjectName: 'Fisica' }, false)).toMatchObject({
      title: 'Materia cambiata',
      body: expect.stringContaining('Ora è Fisica (prima Matematica).')
    })
    expect(lessonChangedPush('student', before, before, true)?.title).toBe('Tutor cambiato')
  })

  it('sum up several changes, and say nothing when nothing changed', () => {
    const moved = {
      ...before,
      subjectName: 'Fisica',
      startAt: new Date('2031-05-07T13:00:00Z')
    }
    expect(lessonChangedPush('student', before, moved, true)).toMatchObject({
      title: 'Lezione modificata',
      body: expect.stringContaining('Con un altro tutor')
    })
    expect(lessonChangedPush('student', before, before, false)).toBeNull()
    // The tutor hears about a change of tutor from the reassignment messages instead.
    expect(lessonChangedPush('tutor', before, before, true)).toBeNull()
  })
  it('leave the subject out of a lesson nobody booked yet', () => {
    const open = { ...before, subjectName: null }
    const later = {
      ...open,
      lessonId: 'new',
      startAt: new Date('2031-05-07T13:00:00Z')
    }
    const bodies = [
      lessonChangedPush('student', open, later, false)?.body,
      lessonChangedPush('student', open, { ...open, durationMinutes: 90 }, false)?.body,
      lessonChangedPush('student', open, open, true)?.body,
      lessonChangedPush('student', open, { ...later, durationMinutes: 90 }, true)?.body,
      lessonReassignedPush(open).body,
      lessonAssignedPush(later, 0).body
    ]
    for (const body of bodies) {
      expect(body).toBeTruthy()
      expect(body).not.toMatch(/null|Materia a scelta|^,|^:/)
    }
    expect(lessonReassignedPush(open).body).toMatch(/^[A-Z][a-zì]+ \d+ /)
    // Going back to no subject is not news for whoever stays on the lesson.
    expect(lessonChangedPush('student', before, { ...before, subjectName: null }, false)).toBeNull()
  })
})

describe('new lessons of the week', () => {
  const monday = new Date('2031-05-05T00:00:00')

  async function addStudent(email: string, year: number | null, isActive = true) {
    const [student] = await db.insert(users).values({
      email,
      firstName: 'S',
      lastName: 'S',
      passwordHash: 'unused',
      role: 'student'
    }).returning({ id: users.id })
    const sectionId = (await db.query.classSections.findFirst())!.id
    await db.insert(studentProfiles).values({
      userId: student.id,
      sectionId,
      year,
      isActive
    })
    await saveSubscription(student.id, {
      endpoint: endpoint(email),
      p256dh: P256DH,
      auth: AUTH
    })
    return student.id
  }

  it('reach the students who can book them, once per week', async () => {
    await subscribe(tokens.student, 'year-2')
    await addStudent('fourth-year@example.test', 4)
    await addStudent('no-year@example.test', null)
    await addStudent('inactive@example.test', 1, false)

    const batch = createPushBatch()
    // Tutors of the 4th year can teach the 2nd year, not the 4th.
    expect(await notifyStudentsOfNewLessons(batch, monday, [3, 4])).toBe(2)
    await batch.finish()
    expect(sent.map(({ target }) => target.endpoint).sort()).toEqual([
      endpoint('no-year@example.test'),
      endpoint('year-2')
    ])
    expect(sent[0].payload).toMatchObject({ title: 'Nuove lezioni disponibili', url: '/student/book' })

    const rerun = createPushBatch()
    expect(await notifyStudentsOfNewLessons(rerun, monday, [5])).toBe(1)
    await rerun.finish()
    expect(sent.map(({ target }) => target.endpoint)).toContain(endpoint('fourth-year@example.test'))
    expect(sent).toHaveLength(3)
  })

  it('reach nobody when no lesson was created', async () => {
    await subscribe(tokens.student, 'year-2')
    expect(await notifyStudentsOfNewLessons(createPushBatch(), monday, [])).toBe(0)
  })
})

describe('reschedule notifications', () => {
  let otherTutorId: string
  let subjectId: string

  beforeAll(async () => {
    const [tutor] = await db.insert(users).values({
      email: 'other-tutor@example.test',
      firstName: 'T',
      lastName: 'T',
      passwordHash: 'unused',
      role: 'tutor'
    }).returning({ id: users.id })
    otherTutorId = tutor.id
    const sectionId = (await db.query.classSections.findFirst())!.id
    await db.insert(tutorProfiles).values({
      userId: otherTutorId,
      sectionId,
      year: 5,
      isActive: true
    })
    await db.insert(tutorSettings).values({ tutorId: otherTutorId, dailyCapacity: 3 })
    subjectId = (await db.query.subjects.findFirst())!.id
  })

  async function bookedLesson(startAt: string) {
    const [lesson] = await db.insert(lessons).values({
      tutorId: ids.tutor,
      subjectId,
      startAt: new Date(startAt),
      durationMinutes: 60,
      seats: 2,
      status: 'confirmed'
    }).returning({ id: lessons.id })
    await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: ids.student,
      subjectId,
      topic: 'Argomento privato'
    })
    return lesson.id
  }

  async function reschedule(lessonId: string, changes: Record<string, unknown>) {
    const response = await call(`/lessons/${lessonId}/reschedule`, {
      token: tokens.admin,
      body: {
        tutorId: ids.tutor,
        subjectId,
        startAt: '2031-06-02T12:00:00.000Z',
        durationMinutes: 60,
        ...changes
      }
    })
    expect(response.status).toBe(200)
    await waitForPendingPush()
    await waitForPendingMail()
  }

  function titlesFor(name: string) {
    return sent.filter(({ target }) => target.endpoint === endpoint(name)).map(({ payload }) => payload.title)
  }

  beforeEach(async () => {
    await subscribe(tokens.student, 'student')
    await subscribe(tokens.tutor, 'tutor')
    await saveSubscription(otherTutorId, {
      endpoint: endpoint('other-tutor'),
      p256dh: P256DH,
      auth: AUTH
    })
  })

  it('tells the student and the same tutor what moved', async () => {
    const lessonId = await bookedLesson('2031-06-02T12:00:00.000Z')
    await reschedule(lessonId, { startAt: '2031-06-03T13:00:00.000Z' })
    expect(titlesFor('student')).toEqual(['Lezione spostata'])
    expect(titlesFor('tutor')).toEqual(['Lezione spostata'])
    expect(titlesFor('other-tutor')).toEqual([])
  })

  it('tells both tutors when the lesson changes hands', async () => {
    const lessonId = await bookedLesson('2031-06-09T12:00:00.000Z')
    await reschedule(lessonId, { startAt: '2031-06-09T12:00:00.000Z', tutorId: otherTutorId })
    expect(titlesFor('student')).toEqual(['Tutor cambiato'])
    expect(titlesFor('tutor')).toEqual(['Lezione riassegnata'])
    expect(titlesFor('other-tutor')).toEqual(['Nuova lezione assegnata'])
    const assigned = sent.find(({ target }) => target.endpoint === endpoint('other-tutor'))?.payload
    expect(String(assigned?.body)).toContain('1 studente prenotato')
    // The lesson keeps its id: the new tutor's link opens the same lesson.
    expect(assigned).toMatchObject({ url: `/tutor/lessons/${lessonId}`, tag: `lesson-${lessonId}` })
    expect(JSON.stringify(sent)).not.toContain('Argomento privato')
  })

  it('tells both tutors even when nobody booked', async () => {
    const [lesson] = await db.insert(lessons).values({
      tutorId: ids.tutor,
      subjectId,
      startAt: new Date('2031-06-16T12:00:00.000Z'),
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })
    await reschedule(lesson.id, { startAt: '2031-06-16T12:00:00.000Z', tutorId: otherTutorId })
    expect(titlesFor('tutor')).toEqual(['Lezione riassegnata'])
    expect(titlesFor('other-tutor')).toEqual(['Nuova lezione assegnata'])
    expect(titlesFor('student')).toEqual([])
  })

  it('stays quiet when nothing changed', async () => {
    const lessonId = await bookedLesson('2031-06-23T12:00:00.000Z')
    await reschedule(lessonId, { startAt: '2031-06-23T12:00:00.000Z' })
    expect(sent).toHaveLength(0)
  })
})

describe('phone setup from a computer', () => {
  it('counts only the current user\'s devices', async () => {
    expect(await (await call('/notifications/push/devices', { token: tokens.student })).json()).toEqual({ count: 0 })
    await subscribe(tokens.student, 'phone')
    await subscribe(tokens.student, 'tablet')
    await subscribe(tokens.tutor, 'tutor-phone')
    expect(await (await call('/notifications/push/devices', { token: tokens.student })).json()).toEqual({ count: 2 })
    expect((await call('/notifications/push/devices')).status).toBe(401)
  })

  it('emails the link once every few minutes, only to the user in person', async () => {
    resetRateLimiters()
    expect((await call('/notifications/push/setup-link', { token: tokens.student, method: 'POST' })).status).toBe(204)
    expect((await call('/notifications/push/setup-link', { token: tokens.student, method: 'POST' })).status).toBe(429)
    expect((await call('/notifications/push/setup-link', { token: tokens.tutor, method: 'POST' })).status).toBe(204)
    expect((await call('/notifications/push/setup-link', { token: tokens.activator, method: 'POST' })).status).toBe(403)

    // The student is rate limited by now: start over to reach the impersonation check.
    resetRateLimiters()
    const impersonation = await call('/admin/impersonate', {
      token: tokens.admin,
      body: { userId: ids.student }
    })
    const { token } = await impersonation.json()
    expect((await call('/notifications/push/setup-link', { token, method: 'POST' })).status).toBe(403)
    resetRateLimiters()
  })

  it('tells admins how many users per role receive push', async () => {
    await subscribe(tokens.student, 'phone')
    await subscribe(tokens.student, 'laptop')
    await subscribe(tokens.admin, 'admin-phone')
    expect((await call('/admin/stats/push/coverage', { token: tokens.student })).status).toBe(403)
    const coverage = await (await call('/admin/stats/push/coverage', { token: tokens.admin })).json() as Array<{ role: string, users: number, withPush: number }>
    expect(coverage.map(row => row.role)).toEqual(['student', 'tutor', 'admin'])
    expect(coverage.find(row => row.role === 'student')!.withPush).toBe(1)
    expect(coverage.find(row => row.role === 'tutor')!.withPush).toBe(0)
    expect(coverage.find(row => row.role === 'admin')!.withPush).toBe(1)
    for (const row of coverage) {
      expect(row.users).toBeGreaterThanOrEqual(row.withPush)
    }
  })
})

describe('notification stats for admins', () => {
  it('counts panel notifications, devices per push service and kinds turned off', async () => {
    await db.delete(notifications)
    await subscribe(tokens.student, 'phone')
    await call('/notifications/preferences', {
      token: tokens.student,
      method: 'PUT',
      body: { reminders: false }
    })
    notifyUsers([ids.student, ids.tutor], 'bookings', message)
    await waitForPendingPush()
    await call('/notifications/inbox/read-all', { token: tokens.student, method: 'POST' })

    expect((await call('/admin/stats/notifications', { token: tokens.student })).status).toBe(403)
    const stats = await (await call('/admin/stats/notifications', { token: tokens.admin })).json()
    expect(stats.inbox).toEqual([
      { category: 'bookings', total: 2, read: 1 }
    ])
    expect(stats.devices).toEqual([
      { service: 'google', devices: 1, workingLast30Days: 1 }
    ])
    expect(stats.optOuts).toEqual([
      { category: 'reminders', users: 1 }
    ])
  })
})

describe('setup link email', () => {
  it('points to the profile with the setup flag', () => {
    const message = buildPushSetupLinkMessage()
    expect(message.text).toContain('/profile?attiva-notifiche=1')
    expect(message.html).toContain('attiva-notifiche=1')
  })
})
