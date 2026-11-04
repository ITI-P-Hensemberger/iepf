// Purpose: Exercise booking/token invariants, public routes and the school-year reset against PostgreSQL.
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { auditLogs } from '@/db/schemas/audit-logs.schema'
import { classSections } from '@/db/schemas/class-sections.schema'
import { emailVerificationTokens } from '@/db/schemas/email-verification-tokens.schema'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { passwordResetTokens } from '@/db/schemas/password-reset-tokens.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { issueAdminInviteToken } from '@/lib/admin-invite'
import { cleanDatabase } from '@/lib/db-cleanup'
import { isUniqueConstraintError } from '@/lib/db-errors'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { getStudentTokenBalance } from '@/lib/lesson-tokens'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer } from '@/lib/mailer'
import { hashPassword } from '@/lib/password'
import { issueTutorInviteToken } from '@/lib/tutor-invite'
import { resetRateLimiters } from '@/middlewares/rate-limit'

let ids: Record<string, string>
let subjectId: string
let adminToken: string
let tutorToken: string
let passwordHash: string
let dayOffset = 7

function request(path: string, options: { method?: string, token?: string, body?: unknown, ip?: string } = {}) {
  return app.request(path, {
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.ip ? { 'x-forwarded-for': options.ip } : {})
    },
    body: options.method === 'GET' ? undefined : JSON.stringify(options.body ?? {})
  })
}

async function login(email: string, password = DEV_PASSWORD) {
  const response = await request('/auth/login', { body: { email, password } })
  expect(response.status).toBe(200)
  return (await response.json()).accessToken as string
}

async function createStudent(tokens: number) {
  const email = `integrity-${crypto.randomUUID()}@example.test`
  const [student] = await db.insert(users).values({
    email,
    firstName: 'Integrity',
    lastName: 'Student',
    passwordHash,
    role: 'student',
    emailVerifiedAt: new Date()
  }).returning({ id: users.id })
  await db.insert(studentProfiles).values({ userId: student.id, year: 1, isActive: true })
  if (tokens !== 0) {
    await db.insert(tokenLedger).values({ studentId: student.id, delta: tokens, reason: 'initial_grant' })
  }
  return { id: student.id, email, token: await login(email, 'Integrity123!') }
}

// Every lesson gets its own future day so daily limits only apply where a test asks for them.
function nextLessonDay() {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  date.setHours(14, 0, 0, 0)
  dayOffset += 1
  return date
}

async function createLesson(seats: number, startAt = nextLessonDay()) {
  const [lesson] = await db.insert(lessons).values({
    tutorId: ids.tutor,
    subjectId,
    startAt,
    durationMinutes: 60,
    seats
  }).returning({ id: lessons.id })
  return lesson.id
}

function book(lessonId: string, token: string) {
  return request(`/lessons/${lessonId}/book`, { token, body: { topic: 'Equazioni' } })
}

function statuses(responses: Response[]) {
  return responses.map(response => response.status).sort()
}

async function confirmedBookings(lessonId: string) {
  const rows = await db.select().from(lessonBookings).where(eq(lessonBookings.lessonId, lessonId))
  return rows.filter(row => row.status === 'confirmed')
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  if (new URL(env.DATABASE_URL).pathname !== '/iepf_test') {
    throw new Error('Integration tests require the isolated iepf_test database')
  }
  await cleanDatabase()
  ids = await seedDevelopmentData()
  passwordHash = await hashPassword('Integrity123!')
  const [subject] = await db.select({ id: subjects.id }).from(subjects).limit(1)
  subjectId = subject.id
  await db.update(tutorSettings).set({ dailyCapacity: 20 }).where(eq(tutorSettings.tutorId, ids.tutor))
  adminToken = await login('admin@example.test')
  tutorToken = await login('tutor@example.test')
})

beforeEach(() => {
  resetRateLimiters()
})

afterAll(async () => {
  closeMailer()
  await closeDb()
})

describe('booking integrity', () => {
  it('books a repeated concurrent request once and charges one token', async () => {
    const student = await createStudent(5)
    const lessonId = await createLesson(5)
    const responses = await Promise.all(Array.from({ length: 6 }, () => book(lessonId, student.token)))
    expect(responses.filter(response => response.status === 201)).toHaveLength(1)
    expect(await confirmedBookings(lessonId)).toHaveLength(1)
    expect(await getStudentTokenBalance(student.id)).toBe(4)
  })

  it('never lets a concurrent student spend more tokens than available', async () => {
    const student = await createStudent(1)
    const lessonIds = [await createLesson(1), await createLesson(1), await createLesson(1)]
    const responses = await Promise.all(lessonIds.map(lessonId => book(lessonId, student.token)))
    expect(statuses(responses)).toEqual([201, 403, 403])
    expect(await getStudentTokenBalance(student.id)).toBe(0)
  })

  it('applies the one-booking-per-day limit to concurrent requests', async () => {
    const student = await createStudent(5)
    const day = nextLessonDay()
    const later = new Date(day)
    later.setHours(15)
    const responses = await Promise.all([
      book(await createLesson(1, day), student.token),
      book(await createLesson(1, later), student.token)
    ])
    expect(statuses(responses)).toEqual([201, 409])
    expect(await getStudentTokenBalance(student.id)).toBe(4)
  })

  it('does not exceed tutor daily capacity across lessons under concurrency', async () => {
    const day = nextLessonDay()
    const later = new Date(day)
    later.setHours(15)
    await db.update(tutorSettings).set({ dailyCapacity: 1 }).where(eq(tutorSettings.tutorId, ids.tutor))
    try {
      const [first, second] = [await createStudent(2), await createStudent(2)]
      const responses = await Promise.all([
        book(await createLesson(1, day), first.token),
        book(await createLesson(1, later), second.token)
      ])
      expect(statuses(responses)).toEqual([201, 409])
    }
    finally {
      await db.update(tutorSettings).set({ dailyCapacity: 20 }).where(eq(tutorSettings.tutorId, ids.tutor))
    }
  })

  it('lets other students join a confirmed lesson until its seats run out', async () => {
    const lessonId = await createLesson(2)
    const [first, second, third] = [await createStudent(2), await createStudent(2), await createStudent(2)]
    expect((await book(lessonId, first.token)).status).toBe(201)

    const available = await request('/lessons/available?limit=100', { method: 'GET', token: second.token })
    const listed = (await available.json()).data.find((lesson: { id: string }) => lesson.id === lessonId)
    expect(listed).toMatchObject({ status: 'confirmed', availableSeats: 1, canBook: true })

    const joined = await book(lessonId, second.token)
    expect(joined.status).toBe(201)
    expect((await book(lessonId, third.token)).status).toBe(409)
    expect(await getStudentTokenBalance(third.id)).toBe(2)

    const { booking } = await joined.json()
    const cancel = await request(`/lessons/${lessonId}/bookings/${booking.id}/cancel`, { method: 'PATCH', token: second.token })
    expect(cancel.status).toBe(200)
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId))
    expect(lesson.status).toBe('confirmed')
    expect((await book(lessonId, third.token)).status).toBe(201)
  })

  it('does not oversell the last seats under concurrency', async () => {
    const lessonId = await createLesson(2)
    const students = await Promise.all([1, 2, 3, 4, 5].map(() => createStudent(2)))
    const responses = await Promise.all(students.map(student => book(lessonId, student.token)))
    expect(statuses(responses)).toEqual([201, 201, 409, 409, 409])
    expect(await confirmedBookings(lessonId)).toHaveLength(2)
  })

  it('still refuses students on canceled lessons', async () => {
    const student = await createStudent(2)
    const lessonId = await createLesson(2)
    await db.update(lessons).set({ status: 'canceled' }).where(eq(lessons.id, lessonId))
    expect((await book(lessonId, student.token)).status).toBe(400)
  })

  it('refunds a concurrent double cancellation only once', async () => {
    const student = await createStudent(3)
    const lessonId = await createLesson(1)
    const created = await (await book(lessonId, student.token)).json()
    expect(await getStudentTokenBalance(student.id)).toBe(2)
    const path = `/lessons/${lessonId}/bookings/${created.booking.id}/cancel`
    const responses = await Promise.all([1, 2, 3].map(() => request(path, { method: 'PATCH', token: student.token })))
    expect(statuses(responses)).toEqual([200, 409, 409])
    expect(await getStudentTokenBalance(student.id)).toBe(3)
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId))
    expect(lesson.status).toBe('scheduled')
  })

  it('does not refund a cancellation after the cutoff', async () => {
    const student = await createStudent(2)
    const lessonId = await createLesson(1, new Date(Date.now() + 60 * 60 * 1000))
    const [booking] = await db.insert(lessonBookings).values({ lessonId, studentId: student.id, topic: 'Tardi' }).returning()
    await db.insert(tokenLedger).values({ studentId: student.id, lessonId, delta: -1, reason: 'lesson_booking' })
    const response = await request(`/lessons/${lessonId}/bookings/${booking.id}/cancel`, { method: 'PATCH', token: student.token })
    expect(response.status).toBe(200)
    expect(await getStudentTokenBalance(student.id)).toBe(1)
  })

  it('refunds each student once when an admin cancels a lesson twice concurrently', async () => {
    const student = await createStudent(2)
    const lessonId = await createLesson(3)
    expect((await book(lessonId, student.token)).status).toBe(201)
    const responses = await Promise.all([1, 2].map(() => request(`/lessons/${lessonId}/cancel`, { token: adminToken })))
    expect(responses.every(response => response.status === 200)).toBe(true)
    expect(await confirmedBookings(lessonId)).toHaveLength(0)
    expect(await getStudentTokenBalance(student.id)).toBe(2)
  })

  it('stops a tutor cancelling a lesson that has bookings', async () => {
    const student = await createStudent(2)
    const lessonId = await createLesson(3)
    expect((await book(lessonId, student.token)).status).toBe(201)
    expect((await request(`/lessons/${lessonId}/cancel`, { token: tutorToken })).status).toBe(403)
    expect(await confirmedBookings(lessonId)).toHaveLength(1)
  })

  it('stops an admin booking the same student twice on one lesson', async () => {
    const student = await createStudent(2)
    const lessonId = await createLesson(3)
    const body = { topic: 'Admin', studentId: student.id }
    const responses = await Promise.all([1, 2].map(() => request(`/lessons/${lessonId}/book`, { token: adminToken, body })))
    expect(statuses(responses)).toEqual([201, 409])
  })

  it('moves confirmed bookings when a lesson is rescheduled', async () => {
    const student = await createStudent(2)
    const lessonId = await createLesson(3)
    expect((await book(lessonId, student.token)).status).toBe(201)
    const response = await request(`/lessons/${lessonId}/reschedule`, {
      token: adminToken,
      body: { tutorId: ids.tutor, subjectId, startAt: nextLessonDay().toISOString(), durationMinutes: 60 }
    })
    expect(response.status).toBe(200)
    const { lessonId: movedTo } = await response.json()
    expect(await confirmedBookings(lessonId)).toHaveLength(0)
    expect(await confirmedBookings(movedTo)).toHaveLength(1)
    expect(await getStudentTokenBalance(student.id)).toBe(1)
  })

  it('rejects a duplicate confirmed booking at database level but allows rebooking', async () => {
    const student = await createStudent(0)
    const lessonId = await createLesson(3)
    const values = { lessonId, studentId: student.id, topic: 'Doppia' }
    const [first] = await db.insert(lessonBookings).values(values).returning()
    await expect(db.insert(lessonBookings).values(values)).rejects.toThrow()
    await db.update(lessonBookings).set({ status: 'canceled' }).where(eq(lessonBookings.id, first.id))
    await expect(db.insert(lessonBookings).values(values)).resolves.toBeDefined()
  })

  it('keeps concurrent admin token adjustments consistent and non-negative', async () => {
    const student = await createStudent(1)
    const responses = await Promise.all([1, 2, 3].map(() => request(`/students/${student.id}/tokens/adjust`, {
      token: adminToken,
      body: { delta: -1, reason: 'test' }
    })))
    expect(responses.every(response => response.status === 200)).toBe(true)
    expect(await getStudentTokenBalance(student.id)).toBe(0)
  })
})

describe('rate limits', () => {
  const wrong = (email: string, ip: string) => request('/auth/login', { ip, body: { email, password: 'wrong-password' } })

  it('limits guesses per account without blocking others on the same IP', async () => {
    const ip = '203.0.113.10'
    const results = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      results.push((await wrong('student@example.test', ip)).status)
    }
    expect(results).toEqual([401, 401, 401, 401, 401, 429])
    expect((await wrong('STUDENT@example.test', ip)).status).toBe(429)
    expect((await wrong('tutor@example.test', ip)).status).toBe(401)
    expect((await wrong('student@example.test', '203.0.113.11')).status).toBe(401)
  })

  it('caps total login attempts from one IP', async () => {
    const ip = '203.0.113.20'
    let limited = 0
    for (let attempt = 0; attempt < 125; attempt += 1) {
      const response = await request('/auth/login', { ip, body: { email: `unknown-${attempt}@example.test`, password: 'x' } })
      limited += response.status === 429 ? 1 : 0
    }
    expect(limited).toBe(5)
  })
})

describe('public and protected routes', () => {
  it('normalizes invited addresses so the account can log in', async () => {
    const response = await request('/auth/tutor-invite', { token: adminToken, body: { email: ' Mario.Rossi@HENSEMBERGER.it ' } })
    expect(response.status).toBeLessThan(300)
    const invite = await db.query.tutorInviteTokens.findFirst({
      where: (fields, ops) => ops.ilike(fields.email, 'mario.rossi@hensemberger.it')
    })
    expect(invite?.email).toBe('mario.rossi@hensemberger.it')
  })

  it('finds the account whatever the case when requesting a password reset', async () => {
    const { id, email } = await createStudent(0)
    const response = await request('/auth/password/reset/request', { body: { email: email.toUpperCase() } })
    expect(response.status).toBe(200)
    expect(await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, id))).toHaveLength(1)
  })

  it('finds the account whatever the case when requesting email verification', async () => {
    const { id, email } = await createStudent(0)
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, id))
    const response = await request('/auth/verify-email/request', { body: { email: email.toUpperCase() } })
    expect(response.status).toBe(200)
    expect(await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, id))).toHaveLength(1)
  })

  it('keeps a tutor invite usable when the confirmation data is invalid', async () => {
    const email = `tutor-${crypto.randomUUID()}@hensemberger.it`
    const { token } = await issueTutorInviteToken(email)
    const [section] = await db.select({ id: classSections.id }).from(classSections).limit(1)
    const body = { token, firstName: 'Nuovo', lastName: 'Tutor', password: 'Integrity123!', year: 4 }

    const rejected = await request('/auth/tutor-invite/confirm', { body: { ...body, sectionId: crypto.randomUUID() } })
    expect(rejected.status).toBe(400)
    expect(await db.query.users.findFirst({ where: eq(users.email, email) })).toBeUndefined()

    const confirmed = await request('/auth/tutor-invite/confirm', { body: { ...body, sectionId: section.id } })
    expect(confirmed.status).toBe(201)
    const user = await db.query.users.findFirst({ where: eq(users.email, email) })
    expect(await db.query.tutorProfiles.findFirst({ where: (fields, ops) => ops.eq(fields.userId, user!.id) })).toBeDefined()
    expect(await db.query.tutorSettings.findFirst({ where: (fields, ops) => ops.eq(fields.tutorId, user!.id) })).toBeDefined()

    const reused = await request('/auth/tutor-invite/confirm', { body: { ...body, sectionId: section.id } })
    expect(reused.status).toBe(401)
  })

  it('lets only one concurrent confirmation spend an invite', async () => {
    const email = `admin-${crypto.randomUUID()}@hensemberger.it`
    const { token } = await issueAdminInviteToken(email)
    const body = { token, firstName: 'Nuovo', lastName: 'Admin', password: 'Integrity123!' }
    const responses = await Promise.all([1, 2].map(() => request('/auth/admin-invite/confirm', { body })))
    expect(responses.map(response => response.status).sort()).toEqual([201, 401])
  })

  it('answers 409 to the loser of a concurrent registration, leaving one complete account', async () => {
    const email = `student-${crypto.randomUUID()}@hensemberger.it`
    const body = { email, firstName: 'Nuovo', lastName: 'Studente', password: 'Integrity123!' }
    const responses = await Promise.all([1, 2, 3].map(() => request('/auth/register', { body })))
    expect(responses.map(response => response.status).sort()).toEqual([201, 409, 409])
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    expect(rows).toHaveLength(1)
    expect(await db.query.studentProfiles.findFirst({ where: (fields, ops) => ops.eq(fields.userId, rows[0].id) })).toBeDefined()
  })

  it('recognizes unique violations wrapped by Drizzle', () => {
    expect(isUniqueConstraintError({ code: '23505' })).toBe(true)
    expect(isUniqueConstraintError({ cause: { code: '23505' } })).toBe(true)
    expect(isUniqueConstraintError({ code: '23503' })).toBe(false)
    expect(isUniqueConstraintError(new Error('other'))).toBe(false)
    expect(isUniqueConstraintError(null)).toBe(false)
  })

  it('serves /health without authentication or audit rows', async () => {
    const before = await db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(eq(auditLogs.path, '/health'))
    const response = await request('/health', { method: 'GET' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'ok' })
    const after = await db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(eq(auditLogs.path, '/health'))
    expect(after[0].total).toBe(before[0].total)
  })

  it('keeps sign-up data public', async () => {
    expect((await request('/class-sections', { method: 'GET' })).status).toBe(200)
  })

  // These relied on, or sat next to, the former global feedback middleware.
  it.each([
    ['GET', '/feedback/me'],
    ['GET', '/feedback'],
    ['POST', '/lessons/00000000-0000-4000-8000-000000000000/feedback'],
    ['GET', '/lessons'],
    ['GET', '/lessons/available'],
    ['GET', '/settings'],
    ['POST', '/settings/school-year/reset'],
    ['GET', '/subject-requests'],
    ['GET', '/subjects'],
    ['POST', '/students/00000000-0000-4000-8000-000000000000/tokens/adjust'],
    ['GET', '/tutors/00000000-0000-4000-8000-000000000000/settings'],
    ['GET', '/tutors/00000000-0000-4000-8000-000000000000/subjects'],
    ['GET', '/tutors/00000000-0000-4000-8000-000000000000/weekday-availability'],
    ['GET', '/subjects/00000000-0000-4000-8000-000000000000/tutors'],
    ['GET', '/users'],
    ['GET', '/admin/stats/feedback/summary'],
    ['GET', '/audit/logs']
  ])('requires authentication for %s %s', async (method, path) => {
    expect((await request(path, { method })).status).toBe(401)
  })
})

// Last: this deletes every student and tutor created above.
describe('school year reset', () => {
  const path = '/settings/school-year/reset'
  const counts = async () => (await db.execute(sql`select
    (select count(*)::int from users where role in ('student', 'tutor')) as people,
    (select count(*)::int from lessons) as lessons,
    (select count(*)::int from token_ledger) as ledger,
    (select count(*)::int from users where role = 'admin') as admins`)).rows[0]

  it('refuses non-admins, a missing confirmation and a wrong password', async () => {
    const before = await counts()
    expect((await request(path, { token: tutorToken, body: { confirmation: 'RESET', password: DEV_PASSWORD } })).status).toBe(403)
    expect((await request(path, { token: adminToken, body: { confirmation: 'NO', password: DEV_PASSWORD } })).status).toBe(422)
    expect((await request(path, { token: adminToken, body: { confirmation: 'RESET' } })).status).toBe(422)
    expect((await request(path, { token: adminToken, body: { confirmation: 'RESET', password: 'wrong' } })).status).toBe(403)
    expect(await counts()).toEqual(before)
  })

  it('refuses an impersonated admin session', async () => {
    const before = await counts()
    const [otherAdmin] = await db.insert(users).values({
      email: `integrity-admin-${crypto.randomUUID()}@example.test`,
      firstName: 'Other',
      lastName: 'Admin',
      passwordHash,
      role: 'admin',
      emailVerifiedAt: new Date()
    }).returning({ id: users.id })
    await db.execute(sql`insert into admin_profiles (id, user_id, is_active) values (${crypto.randomUUID()}, ${otherAdmin.id}, true)`)
    const impersonated = await request('/admin/impersonate', { token: adminToken, body: { userId: otherAdmin.id } })
    expect(impersonated.status).toBe(200)
    const { token } = await impersonated.json()
    const response = await request(path, { token, body: { confirmation: 'RESET', password: 'Integrity123!' } })
    expect(response.status).toBe(403)
    const after = await counts()
    expect(after.people).toBe(before.people)
    expect(after.lessons).toBe(before.lessons)
  })

  it('deletes school-year data and keeps admins with the correct password', async () => {
    const before = await counts()
    expect(before.people).toBeGreaterThan(0)
    const response = await request(path, { token: adminToken, body: { confirmation: 'RESET', password: DEV_PASSWORD } })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.deletedStudents + body.deletedTutors).toBe(before.people)
    const after = await counts()
    expect(after).toEqual({ people: 0, lessons: 0, ledger: 0, admins: before.admins })
  })
})
