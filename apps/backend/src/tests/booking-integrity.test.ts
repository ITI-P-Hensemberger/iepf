// Purpose: Exercise booking/token invariants, public routes and the school-year reset against PostgreSQL.
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AuthenticatedUser } from '@/lib/types'

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
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { issueAdminInviteToken } from '@/lib/admin-invite'
import { createImpersonationToken } from '@/lib/auth'
import { cleanDatabase } from '@/lib/db-cleanup'
import { isUniqueConstraintError } from '@/lib/db-errors'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { getStudentTokenBalance } from '@/lib/lesson-tokens'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer } from '@/lib/mailer'
import { hashPassword } from '@/lib/password'
import { addDays, schoolDayKey, schoolTime } from '@/lib/school-time'
import { issueTutorInviteToken } from '@/lib/tutor-invite'
import { hasRecentReportExport, recordReportExport, REPORT_VALID_MINUTES } from '@/lib/year-report-export'
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

async function createStudent(tokens: number, year: number | null = 1) {
  const email = `integrity-${crypto.randomUUID()}@example.test`
  const [student] = await db.insert(users).values({
    email,
    firstName: 'Integrity',
    lastName: 'Student',
    passwordHash,
    role: 'student',
    emailVerifiedAt: new Date()
  }).returning({ id: users.id })
  await db.insert(studentProfiles).values({ userId: student.id, year, isActive: true })
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

async function createTutor(year: number) {
  const [tutor] = await db.insert(users).values({
    email: `integrity-tutor-${crypto.randomUUID()}@example.test`,
    firstName: 'Integrity',
    lastName: 'Tutor',
    passwordHash,
    role: 'tutor',
    emailVerifiedAt: new Date()
  }).returning({ id: users.id })
  const [section] = await db.select({ id: classSections.id }).from(classSections).limit(1)
  await db.insert(tutorProfiles).values({ userId: tutor.id, sectionId: section.id, year, isActive: true })
  await db.insert(tutorSettings).values({ tutorId: tutor.id, dailyCapacity: 20 })
  return tutor.id
}

async function createLesson(seats: number, startAt = nextLessonDay(), tutorId = ids.tutor) {
  const [lesson] = await db.insert(lessons).values({
    tutorId,
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
    const [booking] = await db.insert(lessonBookings).values({ lessonId, studentId: student.id, subjectId, topic: 'Tardi' }).returning()
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
    const values = { lessonId, studentId: student.id, subjectId, topic: 'Doppia' }
    const [first] = await db.insert(lessonBookings).values(values).returning()
    await expect(db.insert(lessonBookings).values(values)).rejects.toThrow()
    await db.update(lessonBookings).set({ status: 'canceled' }).where(eq(lessonBookings.id, first.id))
    await expect(db.insert(lessonBookings).values(values)).resolves.toBeDefined()
  })

  it('sorts students by the hours they have left', async () => {
    const few = await createStudent(1)
    const many = await createStudent(9)
    const response = await request('/users?role=student&sortBy=lessonTokens&sortDir=desc&limit=200', { method: 'GET', token: adminToken })
    expect(response.status).toBe(200)
    const order = (await response.json()).data.map((user: { id: string }) => user.id)
    expect(order.indexOf(many.id)).toBeLessThan(order.indexOf(few.id))
    const ascending = await request('/users?role=student&sortBy=lessonTokens&sortDir=asc&limit=200', { method: 'GET', token: adminToken })
    const { data } = await ascending.json() as { data: Array<{ lessonTokens: number }> }
    const balances = data.map(user => user.lessonTokens)
    expect(balances).toEqual([...balances].sort((a: number, b: number) => a - b))
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

  it('lists the manual changes with their author, newest first, and only to admins', async () => {
    const student = await createStudent(2)
    await request(`/students/${student.id}/tokens/adjust`, { token: adminToken, body: { delta: 3, reason: 'Recupero' } })
    await request(`/students/${student.id}/tokens/adjust`, { token: adminToken, body: { delta: -1, reason: 'Correzione' } })

    const response = await request(`/students/${student.id}/tokens/history`, { method: 'GET', token: adminToken })
    expect(response.status).toBe(200)
    const history = await response.json()
    // The 2 hours of the start are automatic and stay out.
    expect(history.lessonTokens).toBe(4)
    expect(history.items.map((item: { delta: number, reason: string }) => [item.delta, item.reason]))
      .toEqual([[-1, 'Correzione'], [3, 'Recupero']])
    expect(history.items[0].adminName).toEqual(expect.any(String))

    expect((await request(`/students/${student.id}/tokens/history`, { method: 'GET', token: tutorToken })).status).toBe(403)
  })

  it('deletes a user only with the admin\'s own password', async () => {
    const student = await createStudent(0)
    const remove = (body?: unknown) => request(`/users/${student.id}`, { method: 'DELETE', token: adminToken, body })

    expect((await remove({ password: 'sbagliata' })).status).toBe(403)
    expect((await remove()).status).not.toBe(204)
    expect(await db.query.users.findFirst({ where: (fields, { eq }) => eq(fields.id, student.id) })).toBeDefined()

    expect((await remove({ password: DEV_PASSWORD })).status).toBe(204)
    expect(await db.query.users.findFirst({ where: (fields, { eq }) => eq(fields.id, student.id) })).toBeUndefined()
  })
})

describe('one open lesson per time slot', () => {
  let math: string
  let physics: string
  let untaught: string

  async function createOpenLesson(seats = 3, startAt = nextLessonDay()) {
    const [lesson] = await db.insert(lessons).values({
      tutorId: ids.tutor,
      subjectId: null,
      subjectFromBooking: true,
      startAt,
      durationMinutes: 60,
      seats
    }).returning({ id: lessons.id })
    return lesson.id
  }

  function bookSubject(lessonId: string, token: string, subject?: string) {
    return request(`/lessons/${lessonId}/book`, { token, body: { topic: 'Ripasso', subjectId: subject } })
  }

  async function lessonRow(lessonId: string) {
    const [row] = await db.select().from(lessons).where(eq(lessons.id, lessonId))
    return row
  }

  beforeAll(async () => {
    const created = await db.insert(subjects).values([
      { name: 'Fisica slot', canonicalName: 'slot_physics' },
      { name: 'Latino slot', canonicalName: 'slot_latin' }
    ]).returning({ id: subjects.id })
    physics = created[0].id
    untaught = created[1].id
    const [taught] = await db.select({ subjectId: tutorSubjects.subjectId }).from(tutorSubjects).where(eq(tutorSubjects.tutorId, ids.tutor))
    math = taught.subjectId
    await db.insert(tutorSubjects).values({ tutorId: ids.tutor, subjectId: physics })
  })

  it('asks a booking on an open lesson for one of the tutor\'s subjects', async () => {
    const student = await createStudent(3)
    const lessonId = await createOpenLesson()
    expect((await bookSubject(lessonId, student.token)).status).toBe(400)
    expect((await bookSubject(lessonId, student.token, untaught)).status).toBe(400)
    expect(await getStudentTokenBalance(student.id)).toBe(3)

    const response = await bookSubject(lessonId, student.token, physics)
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.booking.subjectId).toBe(physics)
    expect(body.lesson.subjectId).toBe(physics)
    expect(body.lesson.status).toBe('confirmed')
    expect((await lessonRow(lessonId)).subjectId).toBe(physics)
  })

  it('keeps later bookings to the subject the first one picked', async () => {
    const lessonId = await createOpenLesson()
    const [first, second, third] = [await createStudent(2), await createStudent(2), await createStudent(2)]
    expect((await bookSubject(lessonId, first.token, math)).status).toBe(201)
    const other = await bookSubject(lessonId, second.token, physics)
    expect(other.status).toBe(409)
    expect((await other.json()).error.message).toBe(HttpStatusPhrases.LESSON_SUBJECT_TAKEN)
    // Naming no subject joins the one already picked.
    const joined = await bookSubject(lessonId, third.token)
    expect(joined.status).toBe(201)
    expect((await joined.json()).booking.subjectId).toBe(math)
  })

  it('lets only one subject win when the first bookings race', async () => {
    const lessonId = await createOpenLesson()
    const [first, second] = [await createStudent(2), await createStudent(2)]
    const responses = await Promise.all([
      bookSubject(lessonId, first.token, math),
      bookSubject(lessonId, second.token, physics)
    ])
    expect(statuses(responses)).toEqual([201, 409])
    const booked = await confirmedBookings(lessonId)
    expect(booked).toHaveLength(1)
    expect((await lessonRow(lessonId)).subjectId).toBe(booked[0].subjectId)
  })

  it('opens the subject again when the last booking is canceled, keeping it on the booking', async () => {
    const lessonId = await createOpenLesson()
    const [first, second] = [await createStudent(2), await createStudent(2)]
    const booked = await bookSubject(lessonId, first.token, math)
    const { booking } = await booked.json()
    const cancel = await request(`/lessons/${lessonId}/bookings/${booking.id}/cancel`, { method: 'PATCH', token: first.token })
    expect(cancel.status).toBe(200)
    const reopened = await lessonRow(lessonId)
    expect(reopened.subjectId).toBeNull()
    expect(reopened.status).toBe('scheduled')
    const [canceled] = await db.select().from(lessonBookings).where(eq(lessonBookings.id, booking.id))
    expect(canceled.subjectId).toBe(math)

    expect((await bookSubject(lessonId, second.token, physics)).status).toBe(201)
    expect((await lessonRow(lessonId)).subjectId).toBe(physics)
  })

  it('keeps the subject an admin set when its bookings are canceled', async () => {
    const student = await createStudent(2)
    const lessonId = await createLesson(2)
    const booked = await book(lessonId, student.token)
    const { booking } = await booked.json()
    expect(booking.subjectId).toBe(subjectId)
    await request(`/lessons/${lessonId}/bookings/${booking.id}/cancel`, { method: 'PATCH', token: student.token })
    expect((await lessonRow(lessonId)).subjectId).toBe(subjectId)
    expect((await bookSubject(lessonId, (await createStudent(1)).token, physics)).status).toBe(409)
  })

  it('lists an open lesson under each subject its tutor teaches, with the choices', async () => {
    const student = await createStudent(2)
    const startAt = nextLessonDay()
    const lessonId = await createOpenLesson(3, startAt)
    const from = new Date(startAt.getTime() - 60 * 1000).toISOString()
    const to = new Date(startAt.getTime() + 60 * 1000).toISOString()
    const list = async (subject: string) => {
      const response = await request(`/lessons/available?subjectId=${subject}&from=${from}&to=${to}`, { method: 'GET', token: student.token })
      expect(response.status).toBe(200)
      return (await response.json()).data as Array<{ id: string, subjectId: string | null, subjectOptions: Array<{ id: string }>, canBook: boolean }>
    }
    for (const subject of [math, physics]) {
      const [item] = (await list(subject)).filter(row => row.id === lessonId)
      expect(item.subjectId).toBeNull()
      expect(item.subjectOptions.map(option => option.id).sort()).toEqual([math, physics].sort())
      expect(item.canBook).toBe(true)
    }
    expect((await list(untaught)).some(row => row.id === lessonId)).toBe(false)

    await bookSubject(lessonId, (await createStudent(1)).token, math)
    expect((await list(physics)).some(row => row.id === lessonId)).toBe(false)
    const [locked] = (await list(math)).filter(row => row.id === lessonId)
    expect(locked.subjectOptions.map(option => option.id)).toEqual([math])
  })

  it('sums up bookable lessons per subject and per day for the booking page', async () => {
    const student = await createStudent(3)
    const startAt = nextLessonDay()
    const dayKey = schoolDayKey(startAt)
    const range = new URLSearchParams({ from: schoolTime(dayKey).toISOString(), to: schoolTime(addDays(dayKey, 1)).toISOString() })
    await createOpenLesson(3, startAt)
    const summary = async (query: URLSearchParams) => {
      const response = await request(`/lessons/available/summary?${query}`, { method: 'GET', token: student.token })
      expect(response.status).toBe(200)
      return response.json() as Promise<{ subjects: Array<{ id: string, count: number }>, days: Array<{ day: string, count: number, booked: boolean }> }>
    }
    const before = await summary(range)
    // One open lesson counts for each subject its tutor teaches.
    expect(before.subjects.find(subject => subject.id === math)?.count).toBe(1)
    expect(before.subjects.find(subject => subject.id === physics)?.count).toBe(1)
    expect(before.days).toEqual([{ day: dayKey, count: 1, booked: false }])

    const later = new Date(startAt)
    later.setHours(later.getHours() + 1)
    const bookedLesson = await createOpenLesson(3, later)
    expect((await bookSubject(bookedLesson, student.token, math)).status).toBe(201)
    const after = await summary(new URLSearchParams({ ...Object.fromEntries(range), subjectId: physics }))
    // One lesson a day: the rest of that day is no longer bookable for this student.
    expect(after.days).toEqual([{ day: dayKey, count: 0, booked: true }])
    expect(after.subjects).toEqual([])
  })

  it('shows a tutor their own schedule with bookings, and admins anyone\'s', async () => {
    const student = await createStudent(2)
    const startAt = nextLessonDay()
    const lessonId = await createOpenLesson(3, startAt)
    await bookSubject(lessonId, student.token, math)
    const query = new URLSearchParams({ from: new Date(startAt.getTime() - 60_000).toISOString(), to: new Date(startAt.getTime() + 60_000).toISOString() })
    const schedule = async (token: string, extra: Record<string, string> = {}) => {
      return request(`/lessons/schedule?${new URLSearchParams({ ...Object.fromEntries(query), ...extra })}`, { method: 'GET', token })
    }

    const mine = await schedule(tutorToken)
    expect(mine.status).toBe(200)
    const [item] = (await mine.json()).data as Array<{ id: string, subjectId: string, bookings: Array<{ studentId: string, topic: string, subjectId: string }> }>
    expect(item).toMatchObject({ id: lessonId, subjectId: math })
    expect(item.bookings).toEqual([expect.objectContaining({ studentId: student.id, topic: 'Ripasso', subjectId: math })])

    // A tutor asking for someone else's lessons still gets only their own.
    const otherTutor = await createTutor(5)
    const other = await schedule(tutorToken, { tutorId: otherTutor })
    expect((await other.json()).data.map((row: { id: string }) => row.id)).toEqual([lessonId])
    const forAdmin = await schedule(adminToken, { tutorId: otherTutor })
    expect((await forAdmin.json()).data).toEqual([])

    expect((await schedule(student.token)).status).toBe(403)
    const tooLong = new URLSearchParams({ from: startAt.toISOString(), to: new Date(startAt.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString() })
    expect((await request(`/lessons/schedule?${tooLong}`, { method: 'GET', token: adminToken })).status).toBe(400)
  })

  it('opens an admin lesson created without a subject, like a generated one', async () => {
    for (const subject of [undefined, null]) {
      const created = await request('/lessons', { token: adminToken, body: { tutorId: ids.tutor, subjectId: subject, startAt: nextLessonDay().toISOString(), durationMinutes: 60 } })
      expect(created.status).toBe(201)
      const { lessonId } = await created.json()
      expect(await lessonRow(lessonId)).toMatchObject({ subjectId: null, subjectFromBooking: true, status: 'scheduled' })
      // The first booking picks the subject; once nobody holds a seat it opens again.
      const student = await createStudent(1)
      const booked = await bookSubject(lessonId, student.token, physics)
      expect(booked.status).toBe(201)
      expect((await lessonRow(lessonId)).subjectId).toBe(physics)
      const { booking } = await booked.json()
      await request(`/lessons/${lessonId}/bookings/${booking.id}/cancel`, { method: 'PATCH', token: student.token })
      expect((await lessonRow(lessonId)).subjectId).toBeNull()
    }
  })

  it('lists open lessons for admins without dropping them for a missing subject', async () => {
    const startAt = nextLessonDay()
    const lessonId = await createOpenLesson(3, startAt)
    const query = new URLSearchParams({ tutorId: ids.tutor, subjectId: physics, from: startAt.toISOString(), to: startAt.toISOString() })
    const response = await request(`/lessons?${query}`, { method: 'GET', token: adminToken })
    const { data } = await response.json() as { data: Array<{ id: string, subjectId: string | null, subjectFromBooking: boolean }> }
    const [item] = data.filter(row => row.id === lessonId)
    expect(item).toMatchObject({ subjectId: null, subjectFromBooking: true })
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
    const body = { email, firstName: 'Nuovo', lastName: 'Studente', password: 'Integrity123!', year: 1 }
    const responses = await Promise.all([1, 2, 3].map(() => request('/auth/register', { body })))
    expect(responses.map(response => response.status).sort()).toEqual([201, 409, 409])
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    expect(rows).toHaveLength(1)
    expect(await db.query.studentProfiles.findFirst({ where: (fields, ops) => ops.eq(fields.userId, rows[0].id) })).toBeDefined()
  })

  it('recognizes a real unique violation as Drizzle reports it', async () => {
    const { email } = await createStudent(0)
    const error = await db.insert(users).values({ email, firstName: 'A', lastName: 'B', passwordHash, role: 'student' }).catch(caught => caught)
    expect(isUniqueConstraintError(error)).toBe(true)
  })

  it('keeps the invite and leaves nothing behind when the database fails midway', async () => {
    const email = `tutor-${crypto.randomUUID()}@hensemberger.it`
    const { token } = await issueTutorInviteToken(email)
    const [section] = await db.select({ id: classSections.id }).from(classSections).limit(1)
    const body = { token, firstName: 'Nuovo', lastName: 'Tutor', password: 'Integrity123!', year: 4, sectionId: section.id }

    await db.execute(sql`create function fail_for_test() returns trigger language plpgsql as $$ begin raise exception 'simulated failure'; end $$`)
    await db.execute(sql`create trigger fail_for_test before insert on tutor_settings for each row execute function fail_for_test()`)
    try {
      expect((await request('/auth/tutor-invite/confirm', { body })).status).toBe(500)
    }
    finally {
      await db.execute(sql`drop trigger fail_for_test on tutor_settings`)
      await db.execute(sql`drop function fail_for_test()`)
    }
    expect(await db.query.users.findFirst({ where: eq(users.email, email) })).toBeUndefined()

    expect((await request('/auth/tutor-invite/confirm', { body })).status).toBe(201)
  })

  it('recognizes unique violations wrapped by Drizzle', () => {
    expect(isUniqueConstraintError({ code: '23505' })).toBe(true)
    expect(isUniqueConstraintError({ cause: { code: '23505' } })).toBe(true)
    expect(isUniqueConstraintError({ code: '23503' })).toBe(false)
    expect(isUniqueConstraintError(new Error('other'))).toBe(false)
    expect(isUniqueConstraintError(null)).toBe(false)
  })

  it('has the indexes the main queries rely on', async () => {
    const result = await db.execute(sql`select indexname from pg_indexes where schemaname = 'public'`)
    const names = result.rows.map(row => row.indexname)
    expect(names).toEqual(expect.arrayContaining([
      'lessons_start_at_idx',
      'lessons_tutor_id_idx',
      'lesson_bookings_student_id_idx',
      'token_ledger_student_id_idx',
      'audit_logs_created_at_idx',
      'refresh_tokens_token_hash_unique'
    ]))
  })

  it.each([
    ['lessons_start_at_idx', sql`select id from lessons where start_at >= now()`],
    ['lessons_tutor_id_idx', sql`select id from lessons where tutor_id = '00000000-0000-4000-8000-000000000000'`],
    ['lesson_bookings_student_id_idx', sql`select id from lesson_bookings where student_id = '00000000-0000-4000-8000-000000000000'`],
    ['token_ledger_student_id_idx', sql`select id from token_ledger where student_id = '00000000-0000-4000-8000-000000000000'`],
    ['audit_logs_created_at_idx', sql`select id from audit_logs where created_at < now()`],
    ['refresh_tokens_token_hash_unique', sql`select id from refresh_tokens where token_hash = 'x'`]
  ])('can answer its query with %s', async (index, query) => {
    const plan = await db.transaction(async (tx) => {
      // Test tables are too small for the planner to pick an index on its own.
      await tx.execute(sql`set local enable_seqscan = off`)
      return tx.execute(sql`explain ${query}`)
    })
    expect(JSON.stringify(plan.rows)).toContain(index)
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
    ['GET', '/students/00000000-0000-4000-8000-000000000000/tokens/history'],
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
describe('school years', () => {
  function registerStudent(year?: number) {
    return request('/auth/register', {
      body: {
        email: `student-${crypto.randomUUID()}@hensemberger.it`,
        firstName: 'Nuovo',
        lastName: 'Studente',
        password: 'Integrity123!',
        ...(year === undefined ? {} : { year })
      }
    })
  }

  it.each([[1, 201], [4, 201], [0, 422], [5, 422], [undefined, 422]])('registers a student of year %s with status %i', async (year, status) => {
    expect((await registerStudent(year)).status).toBe(status)
  })

  it.each([[3, 201], [5, 201], [2, 422], [6, 422]])('confirms a tutor invite for year %i with status %i', async (year, status) => {
    const { token } = await issueTutorInviteToken(`tutor-${crypto.randomUUID()}@hensemberger.it`)
    const [section] = await db.select({ id: classSections.id }).from(classSections).limit(1)
    const response = await request('/auth/tutor-invite/confirm', {
      body: { token, firstName: 'Nuovo', lastName: 'Tutor', password: 'Integrity123!', sectionId: section.id, year }
    })
    expect(response.status).toBe(status)
  })

  it('applies the same limits when an admin edits a profile', async () => {
    const student = await createStudent(0)
    const tutorId = await createTutor(4)
    const [section] = await db.select({ id: classSections.id }).from(classSections).limit(1)
    const patch = (id: string, year: number) => request(`/users/${id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { sectionId: section.id, year }
    })
    expect((await patch(student.id, 4)).status).toBe(200)
    expect((await patch(student.id, 5)).status).toBe(422)
    expect((await patch(tutorId, 3)).status).toBe(200)
    expect((await patch(tutorId, 2)).status).toBe(422)
  })

  async function availableOn(day: Date, token: string) {
    const from = new Date(day)
    from.setHours(0, 0, 0, 0)
    const to = new Date(day)
    to.setHours(23, 59, 59, 999)
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), limit: '100' })
    const response = await request(`/lessons/available?${params}`, { method: 'GET', token })
    expect(response.status).toBe(200)
    return await response.json() as { data: Array<{ id: string }>, total: number }
  }

  it.each([
    [4, 1, true],
    [4, 3, true],
    [5, 4, true],
    [3, 2, true],
    [3, 3, false],
    [4, 4, false],
    [3, 4, false],
    [3, null, true]
  ])('with a tutor of year %i and a student of year %s, the lesson is offered and bookable: %s', async (tutorYear, studentYear, allowed) => {
    const student = await createStudent(2, studentYear)
    const day = nextLessonDay()
    const lessonId = await createLesson(1, day, await createTutor(tutorYear))

    const available = await availableOn(day, student.token)
    expect(available.data.map(lesson => lesson.id)).toEqual(allowed ? [lessonId] : [])
    expect(available.total).toBe(allowed ? 1 : 0)

    const booked = await book(lessonId, student.token)
    expect(booked.status).toBe(allowed ? 201 : 403)
    expect(await confirmedBookings(lessonId)).toHaveLength(allowed ? 1 : 0)
    expect(await getStudentTokenBalance(student.id)).toBe(allowed ? 1 : 2)
  })

  it('tells the student why a lesson cannot be booked', async () => {
    const student = await createStudent(1, 4)
    const response = await book(await createLesson(1, nextLessonDay(), await createTutor(4)), student.token)
    expect((await response.json()).error.message).toBe('Puoi prenotare solo lezioni di tutor di un anno superiore al tuo')
  })

  it('lets an admin book a student with a tutor of the same year', async () => {
    const student = await createStudent(1, 4)
    const lessonId = await createLesson(1, nextLessonDay(), await createTutor(4))
    const response = await request(`/lessons/${lessonId}/book`, {
      token: adminToken,
      body: { topic: 'Equazioni', studentId: student.id }
    })
    expect(response.status).toBe(201)
  })
})

describe('school year reset', () => {
  const path = '/settings/school-year/reset'
  const counts = async () => (await db.execute(sql`select
    (select count(*)::int from users where role in ('student', 'tutor')) as people,
    (select count(*)::int from lessons) as lessons,
    (select count(*)::int from token_ledger) as ledger,
    (select count(*)::int from analytics_daily) as usage,
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
    // Admins cannot be impersonated any more; a token minted directly still checks the reset's own guard.
    expect((await request('/admin/impersonate', { token: adminToken, body: { userId: otherAdmin.id } })).status).toBe(403)
    const admin = await db.query.users.findFirst({ where: (fields, ops) => ops.eq(fields.email, 'admin@example.test') })
    const { token } = await createImpersonationToken(admin as AuthenticatedUser, { id: otherAdmin.id, email: 'other@example.test', role: 'admin' } as AuthenticatedUser)
    const response = await request(path, { token, body: { confirmation: 'RESET', password: 'Integrity123!' } })
    expect(response.status).toBe(403)
    const after = await counts()
    expect(after.people).toBe(before.people)
    expect(after.lessons).toBe(before.lessons)
  })

  it('checks the password and the report before the reset, deleting nothing', async () => {
    const before = await counts()
    const check = (password: string) => request(`${path}/check`, { token: adminToken, body: { password } })
    expect((await request(`${path}/check`, { token: tutorToken, body: { password: DEV_PASSWORD } })).status).toBe(403)
    await recordReportExport(ids.admin)
    expect((await check('wrong')).status).toBe(403)
    expect((await check(DEV_PASSWORD)).status).toBe(204)
    await recordReportExport(ids.admin, new Date(Date.now() - (REPORT_VALID_MINUTES + 1) * 60 * 1000))
    expect((await check(DEV_PASSWORD)).status).toBe(409)
    expect(await counts()).toEqual(before)
  })

  it('refuses the reset until the admin has just downloaded the year report', async () => {
    const before = await counts()
    const body = { confirmation: 'RESET', password: DEV_PASSWORD }
    expect((await request(path, { token: adminToken, body })).status).toBe(409)
    // A report saved too long ago does not count.
    await recordReportExport(ids.admin, new Date(Date.now() - (REPORT_VALID_MINUTES + 1) * 60 * 1000))
    expect((await request(path, { token: adminToken, body })).status).toBe(409)
    expect(await counts()).toEqual(before)
  })

  it('deletes school-year data and keeps admins with the correct password', async () => {
    await db.execute(sql`insert into analytics_daily (day, event, detail, role, year, count) values ('2026-03-02', 'page_view', '/student', 'student', 2, 5)`)
    const before = await counts()
    expect(before.people).toBeGreaterThan(0)
    expect(before.usage).toBeGreaterThan(0)
    const report = await request('/admin/stats/report', { method: 'GET', token: adminToken })
    expect(report.status).toBe(200)
    const response = await request(path, { token: adminToken, body: { confirmation: 'RESET', password: DEV_PASSWORD } })
    expect(response.status).toBe(200)
    // The next reset needs a new report.
    expect(await hasRecentReportExport(ids.admin)).toBe(false)
    const body = await response.json()
    expect(body.deletedStudents + body.deletedTutors).toBe(before.people)
    const after = await counts()
    expect(after).toEqual({ people: 0, lessons: 0, ledger: 0, usage: 0, admins: before.admins })
  })
})
