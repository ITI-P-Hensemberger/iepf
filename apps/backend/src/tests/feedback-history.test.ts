// Purpose: Pin the feedback history: who may edit and until when, what each reader sees, and soft deletion.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { FEEDBACK_EDIT_DAYS } from '@/lib/feedback-history'
import { assertLocalDatabase } from '@/lib/local-database'
import { resetRateLimiters } from '@/middlewares/rate-limit'

vi.mock('@/lib/mailer', () => ({
  sendMail: async () => {},
  closeMailer: () => {},
  waitForPendingMail: async () => {}
}))

interface History {
  deletedAt: string | null
  deletedByName: string | null
  versions: Array<{ rating: number, text: string | null, editorRole: string, editorIsAuthor: boolean, editorName: string | null }>
}

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

async function lessonWithBooking(startedDaysAgo = 0) {
  const startAt = new Date(Date.now() - startedDaysAgo * 24 * 60 * 60 * 1000 - 30 * 60 * 1000)
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
    studentPresence: true
  }).returning({ id: lessonBookings.id })
  return { lessonId: lesson.id, bookingId: booking.id }
}

async function history(feedbackId: string, token: string) {
  const response = await call(`/feedback/${feedbackId}/history`, { token })
  return {
    status: response.status,
    body: response.status === 200
      ? await response.json() as History
      : null
  }
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

afterAll(async () => {
  await closeDb()
})

describe('feedback history', () => {
  it('records every real change, by the author and by an admin, rating included', async () => {
    const { lessonId, bookingId } = await lessonWithBooking()
    const created = await (await call(`/lessons/${lessonId}/feedback`, {
      token: tokens.tutor,
      body: { bookingId, rating: 3, text: 'Ha svolto gli esercizi.' }
    })).json()
    expect(created.versionCount).toBe(1)

    const patch = (token: string, body: unknown) => call(`/lessons/${lessonId}/feedback/${created.id}`, { token, method: 'PATCH', body })
    expect((await patch(tokens.tutor, { rating: 4, text: 'Ha svolto da sola gli esercizi.' })).status).toBe(200)
    // Saving the same content is not a new version.
    expect((await patch(tokens.tutor, { rating: 4, text: 'Ha svolto da sola gli esercizi.' })).status).toBe(200)
    // A rating alone is a change.
    expect((await patch(tokens.tutor, { rating: 5 })).status).toBe(200)
    expect((await call(`/feedback/${created.id}`, {
      token: tokens.admin,
      method: 'PATCH',
      body: { text: 'Ha svolto gli esercizi da sola.' }
    })).status).toBe(200)

    const forAdmin = (await history(created.id, tokens.admin)).body!
    expect(forAdmin.versions.map(version => [version.editorRole, version.rating, version.text])).toEqual([
      ['admin', 5, 'Ha svolto gli esercizi da sola.'],
      ['tutor', 5, 'Ha svolto da sola gli esercizi.'],
      ['tutor', 4, 'Ha svolto da sola gli esercizi.'],
      ['tutor', 3, 'Ha svolto gli esercizi.']
    ])
    expect(forAdmin.versions[0].editorName).toBe('Demo admin')
    expect(forAdmin.versions[1]).toMatchObject({ editorIsAuthor: true, editorName: 'Demo tutor' })

    // The author sees the same history without names.
    const forAuthor = (await history(created.id, tokens.tutor)).body!
    expect(forAuthor.versions).toHaveLength(4)
    expect(forAuthor.versions.every(version => version.editorName === null)).toBe(true)
    expect(forAuthor.versions[0]).toMatchObject({ editorRole: 'admin', editorIsAuthor: false })

    const mine = await (await call(`/feedback/me?lessonId=${lessonId}`, { token: tokens.tutor })).json()
    expect(mine.data[0]).toMatchObject({ versionCount: 4, lastEditorRole: 'admin' })
    expect(mine.data[0].editableUntil).not.toBeNull()
  })

  it('never shows a feedback to the one it is about', async () => {
    const { lessonId, bookingId } = await lessonWithBooking()
    const created = await (await call(`/lessons/${lessonId}/feedback`, {
      token: tokens.tutor,
      body: { bookingId, rating: 2, text: 'Distratto' }
    })).json()

    const studentList = await (await call(`/feedback/me?lessonId=${lessonId}`, { token: tokens.student })).json()
    expect(studentList.data).toEqual([])
    expect((await history(created.id, tokens.student)).status).toBe(404)
    expect((await call(`/lessons/${lessonId}/feedback/${created.id}`, {
      token: tokens.student,
      method: 'PATCH',
      body: { rating: 5 }
    })).status).toBe(403)
  })

  it('lets students edit their own feedback, and authors only for a week', async () => {
    const recent = await lessonWithBooking()
    const mine = await (await call(`/lessons/${recent.lessonId}/feedback`, {
      token: tokens.student,
      body: { bookingId: recent.bookingId, rating: 3 }
    })).json()
    expect((await call(`/lessons/${recent.lessonId}/feedback/${mine.id}`, {
      token: tokens.student,
      method: 'PATCH',
      body: { rating: 5, text: 'Utile' }
    })).status).toBe(200)
    expect((await history(mine.id, tokens.student)).body!.versions).toHaveLength(2)

    const old = await lessonWithBooking(FEEDBACK_EDIT_DAYS + 1)
    const late = await (await call(`/lessons/${old.lessonId}/feedback`, {
      token: tokens.tutor,
      body: { bookingId: old.bookingId, rating: 4, text: 'Bene' }
    })).json()
    const refused = await call(`/lessons/${old.lessonId}/feedback/${late.id}`, {
      token: tokens.tutor,
      method: 'PATCH',
      body: { rating: 1 }
    })
    expect(refused.status).toBe(409)
    expect((await refused.json()).error.message).toContain('7 giorni')
    // Admins have no limit.
    expect((await call(`/feedback/${late.id}`, {
      token: tokens.admin,
      method: 'PATCH',
      body: { rating: 3 }
    })).status).toBe(200)
  })

  it('hides a deleted feedback but keeps its history for the admins', async () => {
    const { lessonId, bookingId } = await lessonWithBooking()
    const created = await (await call(`/lessons/${lessonId}/feedback`, {
      token: tokens.tutor,
      body: { bookingId, rating: 1, text: 'Testo da togliere' }
    })).json()

    expect((await call(`/feedback/${created.id}`, { token: tokens.admin, method: 'DELETE' })).status).toBe(200)
    const row = await db.query.lessonFeedback.findFirst({
      where: eq(lessonFeedback.id, created.id)
    })
    expect(row?.deletedAt).not.toBeNull()

    const adminList = await (await call(`/feedback?lessonId=${lessonId}`, { token: tokens.admin })).json()
    expect(adminList.data).toEqual([])
    const withDeleted = await (await call(`/feedback?lessonId=${lessonId}&includeDeleted=true`, { token: tokens.admin })).json()
    expect(withDeleted.data[0].deletedAt).not.toBeNull()

    const forAdmin = (await history(created.id, tokens.admin)).body!
    expect(forAdmin).toMatchObject({ deletedByName: 'Demo admin' })
    expect(forAdmin.versions[0].text).toBe('Testo da togliere')

    // Gone for the author, who may write a new one.
    expect((await history(created.id, tokens.tutor)).status).toBe(404)
    expect((await call(`/feedback/me?lessonId=${lessonId}`, { token: tokens.tutor }).then(r => r.json())).data).toEqual([])
    expect((await call(`/lessons/${lessonId}/feedback`, {
      token: tokens.tutor,
      body: { bookingId, rating: 3, text: 'Nuovo' }
    })).status).toBe(200)
  })
})

describe('searching feedback', () => {
  it('finds feedback by the author\'s or the recipient\'s name and by its text', async () => {
    const { lessonId, bookingId } = await lessonWithBooking()
    const created = await (await call(`/lessons/${lessonId}/feedback`, {
      token: tokens.tutor,
      body: { bookingId, rating: 4, text: 'Ottimo lavoro sulle frazioni_100%' }
    })).json()
    const search = async (q: string) => {
      const page = await (await call(`/feedback?${new URLSearchParams({ q, lessonId })}`, { token: tokens.admin })).json()
      return page.data.map((item: { id: string }) => item.id)
    }

    expect(await search('frazioni')).toEqual([created.id])
    expect(await search('Demo tutor')).toEqual([created.id])
    expect(await search('student')).toEqual([created.id])
    expect(await search('_100%')).toEqual([created.id])
    expect(await search('geometria')).toEqual([])
    expect((await call('/feedback?q=demo', { token: tokens.tutor })).status).toBe(403)
  })
})
