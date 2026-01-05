// Purpose: Lessons, availability, and token flows integration tests.
import { testClient } from 'hono/testing'
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AuthenticatedUser } from '@/lib/types'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { tutorAvailability } from '@/db/schemas/tutor-availability.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { createAccessToken } from '@/lib/auth'
import { createTestApp } from '@/lib/create-app'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import lessonsRouter from '@/routes/lessons/lessons.index'
import tokensRouter from '@/routes/tokens/tokens.index'
import tutorAvailabilityRouter from '@/routes/tutor-availability/tutor-availability.index'
import tutorSettingsRouter from '@/routes/tutor-settings/tutor-settings.index'
import { ensureTestSchema } from '@/tests/test-setup'

if (env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV must be \'test\'')
}

const lessonsClient = testClient(createTestApp(lessonsRouter)) as any
const availabilityClient = testClient(createTestApp(tutorAvailabilityRouter)) as any
const settingsClient = testClient(createTestApp(tutorSettingsRouter)) as any
const tokensClient = testClient(createTestApp(tokensRouter)) as any

const adminIdentity: AuthenticatedUser = {
  id: 'admin-user',
  email: 'admin@example.com',
  role: 'admin'
}

async function issueToken(user: AuthenticatedUser) {
  const { token } = await createAccessToken(user)
  return token
}

function bearer(token: string) {
  return {
    Authorization: `Bearer ${token}`
  }
}

async function tokenForTutor(tutorId: string) {
  return issueToken({
    id: tutorId,
    email: 'tutor@example.com',
    role: 'tutor'
  })
}

async function tokenForStudent(studentId: string) {
  return issueToken({
    id: studentId,
    email: 'student@example.com',
    role: 'student'
  })
}

function nextWeekDateForWeekday(weekday: number) {
  const now = new Date()
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = base.getUTCDay()
  let daysUntilNextMonday = (8 - day) % 7
  if (daysUntilNextMonday === 0) {
    daysUntilNextMonday = 7
  }

  const start = new Date(base)
  start.setUTCDate(base.getUTCDate() + daysUntilNextMonday)
  const date = new Date(start)
  date.setUTCDate(start.getUTCDate() + (weekday - 1))
  return date.toISOString().slice(0, 10)
}

function slotStartAt(date: string, time = '15:00') {
  return new Date(`${date}T${time}:00.000Z`)
}

function pastLessonStart(hoursAgo = 2) {
  const startAt = new Date()
  startAt.setHours(startAt.getHours() - hoursAgo)
  startAt.setMinutes(0, 0, 0)
  return startAt
}

function pastLessonStartDays(daysAgo = 2) {
  const startAt = new Date()
  startAt.setDate(startAt.getDate() - daysAgo)
  startAt.setHours(9, 0, 0, 0)
  return startAt
}

async function createTutor() {
  const [tutor] = await db.insert(users).values({
    email: `tutor-${randomUUID()}@example.com`,
    firstName: 'Tutor',
    lastName: 'Example',
    passwordHash: 'hash',
    role: 'tutor',
    emailVerifiedAt: new Date()
  }).returning({
    id: users.id
  })
  return tutor
}

async function createStudent(tokens = 30) {
  const [student] = await db.insert(users).values({
    email: `student-${randomUUID()}@example.com`,
    firstName: 'Student',
    lastName: 'Example',
    passwordHash: 'hash',
    role: 'student',
    emailVerifiedAt: new Date()
  }).returning({
    id: users.id
  })

  await db.insert(studentProfiles).values({
    userId: student.id,
    lessonTokens: tokens
  })
  return student
}

async function createSubject() {
  const [subject] = await db.insert(subjects).values({
    name: 'Algebra',
    canonicalName: `algebra-${randomUUID()}`
  }).returning({
    id: subjects.id
  })
  return subject
}

beforeAll(async () => {
  await ensureTestSchema()
})

beforeEach(async () => {
  await db.delete(lessonBookings)
  await db.delete(lessons)
  await db.delete(tokenLedger)
  await db.delete(tutorAvailability)
  await db.delete(tutorSettings)
  await db.delete(tutorSubjects)
  await db.delete(subjects)
  await db.delete(studentProfiles)
  await db.delete(users)
})

describe('lesson flows', () => {
  it('returns default settings when none exist', async () => {
    const tutor = await createTutor()
    const tutorToken = await tokenForTutor(tutor.id)

    const response = await settingsClient.tutors[':tutorId'].settings.$get({
      param: { tutorId: tutor.id },
      header: bearer(tutorToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as {
      defaultStartTime: string
      defaultDurationMinutes: number
      defaultSeats: number
    }
    expect(body).toMatchObject({
      defaultStartTime: '15:00',
      defaultDurationMinutes: 60,
      defaultSeats: 2
    })
  })

  it('allows admins to update tutor settings', async () => {
    const tutor = await createTutor()
    const adminToken = await issueToken(adminIdentity)

    const response = await settingsClient.tutors[':tutorId'].settings.$put({
      param: { tutorId: tutor.id },
      json: {
        defaultStartTime: '16:00',
        defaultDurationMinutes: 45,
        defaultSeats: 3
      },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as { defaultSeats: number }
    expect(body.defaultSeats).toBe(3)
  })

  it('creates availability using tutor settings defaults', async () => {
    const tutor = await createTutor()
    const adminToken = await issueToken(adminIdentity)
    const tutorToken = await tokenForTutor(tutor.id)

    await settingsClient.tutors[':tutorId'].settings.$put({
      param: { tutorId: tutor.id },
      json: {
        defaultStartTime: '16:30',
        defaultDurationMinutes: 50,
        defaultSeats: 4
      },
      header: bearer(adminToken)
    })

    const date = nextWeekDateForWeekday(2)
    const response = await availabilityClient.tutors[':tutorId'].availability.$post({
      param: { tutorId: tutor.id },
      json: { date },
      header: bearer(tutorToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
    const body = await response.json() as { durationMinutes: number, seats: number }
    expect(body.durationMinutes).toBe(50)
    expect(body.seats).toBe(4)
  })

  it('allows tutors to manage availability', async () => {
    const tutor = await createTutor()
    const tutorToken = await tokenForTutor(tutor.id)

    const date = nextWeekDateForWeekday(2)
    const response = await availabilityClient.tutors[':tutorId'].availability.$post({
      param: { tutorId: tutor.id },
      json: {
        date
      },
      header: bearer(tutorToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
  })

  it('lists and deletes availability entries', async () => {
    const tutor = await createTutor()
    const tutorToken = await tokenForTutor(tutor.id)

    const date = nextWeekDateForWeekday(3)
    const createResponse = await availabilityClient.tutors[':tutorId'].availability.$post({
      param: { tutorId: tutor.id },
      json: {
        date
      },
      header: bearer(tutorToken)
    })
    const created = await createResponse.json() as { id: string }

    const listResponse = await availabilityClient.tutors[':tutorId'].availability.$get({
      param: { tutorId: tutor.id },
      header: bearer(tutorToken)
    })
    expect(listResponse.status).toBe(HttpStatusCodes.OK)
    const listBody = await listResponse.json() as Array<{ id: string }>
    expect(listBody.map(row => row.id)).toContain(created.id)

    const deleteResponse = await availabilityClient.tutors[':tutorId'].availability[':availabilityId'].$delete({
      param: { tutorId: tutor.id, availabilityId: created.id },
      header: bearer(tutorToken)
    })
    expect(deleteResponse.status).toBe(HttpStatusCodes.NO_CONTENT)

    const listAfterDelete = await availabilityClient.tutors[':tutorId'].availability.$get({
      param: { tutorId: tutor.id },
      header: bearer(tutorToken)
    })
    const remaining = await listAfterDelete.json() as Array<{ id: string }>
    expect(remaining).toHaveLength(0)
  })

  it('lists available slots for students', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)

    const date = nextWeekDateForWeekday(5)
    const startAt = slotStartAt(date)
    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const studentToken = await tokenForStudent(student.id)
    const response = await availabilityClient.tutors[':tutorId'].availability.slots.$get({
      param: { tutorId: tutor.id },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as Array<{ id: string }>
    expect(body.map(row => row.id)).toContain(availability.id)
  })

  it('books a lesson and decrements tokens', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()
    await db.insert(tutorSubjects).values({ tutorId: tutor.id, subjectId: subject.id })

    const date = nextWeekDateForWeekday(2)
    const startAt = slotStartAt(date)
    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const studentToken = await tokenForStudent(student.id)

    const response = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'Linear equations'
      },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
    const body = await response.json() as { lesson: { id: string } }

    const profile = await db.query.studentProfiles.findFirst({
      where(fields, operators) {
        return operators.eq(fields.userId, student.id)
      },
      columns: { lessonTokens: true }
    })
    expect(profile?.lessonTokens).toBe(0)

    const ledger = await db.query.tokenLedger.findFirst({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.studentId, student.id),
          operators.eq(fields.lessonId, body.lesson.id)
        )
      },
      columns: { delta: true, reason: true }
    })
    expect(ledger).toMatchObject({ delta: -1, reason: 'lesson_booking' })
  })

  it('allows a student to rebook after canceling', async () => {
    const tutor = await createTutor()
    const student = await createStudent(2)
    const subject = await createSubject()
    await db.insert(tutorSubjects).values({ tutorId: tutor.id, subjectId: subject.id })

    const date = nextWeekDateForWeekday(2)
    const startAt = slotStartAt(date)
    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const studentToken = await tokenForStudent(student.id)
    const firstResponse = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'First booking'
      },
      header: bearer(studentToken)
    })
    expect(firstResponse.status).toBe(HttpStatusCodes.CREATED)
    const booked = await firstResponse.json() as { lesson: { id: string }, booking: { id: string } }

    const cancelResponse = await lessonsClient.lessons[':lessonId'].bookings[':bookingId'].$delete({
      param: { lessonId: booked.lesson.id, bookingId: booked.booking.id },
      header: bearer(studentToken)
    })
    expect(cancelResponse.status).toBe(HttpStatusCodes.NO_CONTENT)

    const secondResponse = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'Second booking'
      },
      header: bearer(studentToken)
    })
    expect(secondResponse.status).toBe(HttpStatusCodes.CREATED)
  })

  it('rejects bookings for subjects not assigned to tutors', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const date = nextWeekDateForWeekday(2)
    const startAt = slotStartAt(date)
    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const studentToken = await tokenForStudent(student.id)

    const response = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'Intro topic'
      },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST)
  })

  it('rejects bookings when students have no tokens', async () => {
    const tutor = await createTutor()
    const student = await createStudent(0)
    const subject = await createSubject()
    await db.insert(tutorSubjects).values({ tutorId: tutor.id, subjectId: subject.id })

    const date = nextWeekDateForWeekday(2)
    const startAt = slotStartAt(date)
    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const studentToken = await tokenForStudent(student.id)

    const response = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'No tokens'
      },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.FORBIDDEN)
  })

  it('rejects bookings for past availability slots', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()
    await db.insert(tutorSubjects).values({ tutorId: tutor.id, subjectId: subject.id })

    const startAt = pastLessonStart(2)
    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const studentToken = await tokenForStudent(student.id)

    const response = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'Past slot'
      },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST)
  })

  it('rejects bookings on the same day as the availability', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()
    await db.insert(tutorSubjects).values({ tutorId: tutor.id, subjectId: subject.id })

    const now = new Date()
    const sameDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    sameDay.setUTCHours(15, 0, 0, 0)

    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt: sameDay,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const studentToken = await tokenForStudent(student.id)

    const response = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'Same day booking'
      },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST)
  })

  it('rejects bookings when lesson seats are full', async () => {
    const tutor = await createTutor()
    const studentA = await createStudent(1)
    const studentB = await createStudent(1)
    const subject = await createSubject()
    await db.insert(tutorSubjects).values({ tutorId: tutor.id, subjectId: subject.id })

    const date = nextWeekDateForWeekday(4)
    const startAt = slotStartAt(date)
    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt,
      durationMinutes: 60,
      seats: 1
    }).returning({ id: tutorAvailability.id })

    const studentTokenA = await tokenForStudent(studentA.id)
    const studentTokenB = await tokenForStudent(studentB.id)

    const first = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'Seat 1'
      },
      header: bearer(studentTokenA)
    })
    expect(first.status).toBe(HttpStatusCodes.CREATED)

    const second = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'Seat 2'
      },
      header: bearer(studentTokenB)
    })
    expect(second.status).toBe(HttpStatusCodes.CONFLICT)
  })

  it('completes lessons when tutor and student confirm after end time', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })

    const [booking] = await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Post-lesson confirm'
    }).returning({ id: lessonBookings.id })

    const studentToken = await tokenForStudent(student.id)
    const studentConfirm = await lessonsClient.lessons[':lessonId'].bookings[':bookingId'].confirm.$post({
      param: { lessonId: lesson.id, bookingId: booking.id },
      json: { completed: true },
      header: bearer(studentToken)
    })
    expect(studentConfirm.status).toBe(HttpStatusCodes.OK)

    const tutorToken = await tokenForTutor(tutor.id)
    const tutorConfirm = await lessonsClient.lessons[':lessonId'].confirm.tutor.$post({
      param: { lessonId: lesson.id },
      json: { completed: true },
      header: bearer(tutorToken)
    })
    expect(tutorConfirm.status).toBe(HttpStatusCodes.OK)

    const updated = await db.query.lessons.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, lesson.id)
      },
      columns: { status: true }
    })
    expect(updated?.status).toBe('completed')
  })

  it('stalls lessons when a participant reports an issue', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })

    const [booking] = await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Report issue'
    }).returning({ id: lessonBookings.id })

    const studentToken = await tokenForStudent(student.id)
    const studentConfirm = await lessonsClient.lessons[':lessonId'].bookings[':bookingId'].confirm.$post({
      param: { lessonId: lesson.id, bookingId: booking.id },
      json: { completed: false },
      header: bearer(studentToken)
    })
    expect(studentConfirm.status).toBe(HttpStatusCodes.OK)

    const updated = await db.query.lessons.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, lesson.id)
      },
      columns: { status: true }
    })
    expect(updated?.status).toBe('stalled')
  })

  it('rejects confirmations before the lesson end window', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = new Date()
    startAt.setHours(startAt.getHours() + 2)
    startAt.setMinutes(0, 0, 0)

    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })

    const [booking] = await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Too early'
    }).returning({ id: lessonBookings.id })

    const studentToken = await tokenForStudent(student.id)
    const response = await lessonsClient.lessons[':lessonId'].bookings[':bookingId'].confirm.$post({
      param: { lessonId: lesson.id, bookingId: booking.id },
      json: { completed: true },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST)
  })

  it('lists pending confirmations for admins', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })

    await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Awaiting confirmation'
    })

    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons.confirmations.$get({
      query: { state: 'pending' },
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as Array<{ id: string, confirmedCount: number }>
    expect(body.map(row => row.id)).toContain(lesson.id)
    const entry = body.find(row => row.id === lesson.id)
    expect(entry?.confirmedCount).toBe(0)
  })

  it('returns confirmation details for admins', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2,
      tutorConfirmed: true,
      tutorConfirmedAt: new Date(),
      tutorConfirmationNote: 'All good'
    }).returning({ id: lessons.id })

    const [booking] = await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Detail confirm',
      studentConfirmed: true,
      studentConfirmedAt: new Date(),
      studentConfirmationNote: 'Went well'
    }).returning({ id: lessonBookings.id })

    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons[':lessonId'].confirmations.$get({
      param: { lessonId: lesson.id },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as {
      lesson: { tutorConfirmationNote: string | null }
      bookings: Array<{ id: string, studentConfirmationNote: string | null }>
    }
    expect(body.lesson.tutorConfirmationNote).toBe('All good')
    const bookingDetail = body.bookings.find(row => row.id === booking.id)
    expect(bookingDetail?.studentConfirmationNote).toBe('Went well')
  })

  it('auto-stalls overdue lessons and lists them as stalled', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStartDays(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })

    await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Overdue'
    })

    const adminToken = await issueToken(adminIdentity)
    const pending = await lessonsClient.lessons.confirmations.$get({
      query: { state: 'pending' },
      header: bearer(adminToken)
    })
    expect(pending.status).toBe(HttpStatusCodes.OK)
    const pendingBody = await pending.json() as Array<{ id: string }>
    expect(pendingBody.map(row => row.id)).not.toContain(lesson.id)

    const stalled = await lessonsClient.lessons.confirmations.$get({
      query: { state: 'stalled' },
      header: bearer(adminToken)
    })
    expect(stalled.status).toBe(HttpStatusCodes.OK)
    const stalledBody = await stalled.json() as Array<{ id: string }>
    expect(stalledBody.map(row => row.id)).toContain(lesson.id)
  })

  it('allows admins to override confirmations to complete a lesson', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2,
      status: 'stalled'
    }).returning({ id: lessons.id })

    const [booking] = await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Override confirm'
    }).returning({ id: lessonBookings.id })

    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons[':lessonId'].confirmations.override.$post({
      param: { lessonId: lesson.id },
      json: {
        tutorConfirmed: true,
        tutorNote: 'Reviewed by admin',
        bookings: [{
          bookingId: booking.id,
          completed: true,
          note: 'Student confirmed via admin'
        }]
      },
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as { lesson: { status: string, tutorConfirmationNote: string | null } }
    expect(body.lesson.status).toBe('completed')
    expect(body.lesson.tutorConfirmationNote).toBe('Reviewed by admin')
  })

  it('allows admins to override confirmations to stall a lesson', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })

    const [booking] = await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Override to stall'
    }).returning({ id: lessonBookings.id })

    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons[':lessonId'].confirmations.override.$post({
      param: { lessonId: lesson.id },
      json: {
        tutorConfirmed: false,
        bookings: [{
          bookingId: booking.id,
          completed: true
        }]
      },
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as { lesson: { status: string } }
    expect(body.lesson.status).toBe('stalled')
  })

  it('rejects override requests for finalized lessons', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2,
      status: 'completed'
    }).returning({ id: lessons.id })

    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons[':lessonId'].confirmations.override.$post({
      param: { lessonId: lesson.id },
      json: { tutorConfirmed: true },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CONFLICT)
  })

  it('returns 404 for confirmation details when lesson is missing', async () => {
    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons[':lessonId'].confirmations.$get({
      param: { lessonId: randomUUID() },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.NOT_FOUND)
  })

  it('returns empty pending list when lessons have no bookings', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    })

    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons.confirmations.$get({
      query: { state: 'pending' },
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as Array<{ id: string }>
    expect(body).toEqual([])
  })

  it('auto-stalls overdue lessons with partial confirmations', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStartDays(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2,
      tutorConfirmed: true,
      tutorConfirmedAt: new Date()
    }).returning({ id: lessons.id })

    await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Partial confirm'
    })

    const adminToken = await issueToken(adminIdentity)
    await lessonsClient.lessons.confirmations.$get({
      query: { state: 'pending' },
      header: bearer(adminToken)
    })

    const updated = await db.query.lessons.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, lesson.id)
      },
      columns: { status: true }
    })
    expect(updated?.status).toBe('stalled')
  })

  it('blocks confirmations after auto-stall threshold', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStartDays(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })

    const [booking] = await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Late confirm'
    }).returning({ id: lessonBookings.id })

    const studentToken = await tokenForStudent(student.id)
    const response = await lessonsClient.lessons[':lessonId'].bookings[':bookingId'].confirm.$post({
      param: { lessonId: lesson.id, bookingId: booking.id },
      json: { completed: true },
      header: bearer(studentToken)
    })
    expect(response.status).toBe(HttpStatusCodes.CONFLICT)
  })

  it('prevents confirmations once a lesson is stalled', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2,
      status: 'stalled'
    }).returning({ id: lessons.id })

    const [booking] = await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Stalled confirm'
    }).returning({ id: lessonBookings.id })

    const studentToken = await tokenForStudent(student.id)
    const response = await lessonsClient.lessons[':lessonId'].bookings[':bookingId'].confirm.$post({
      param: { lessonId: lesson.id, bookingId: booking.id },
      json: { completed: true },
      header: bearer(studentToken)
    })
    expect(response.status).toBe(HttpStatusCodes.CONFLICT)
  })

  it('allows admins to resolve stalled lessons as completed', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2,
      status: 'stalled'
    }).returning({ id: lessons.id })

    const [booking] = await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Resolved as complete'
    }).returning({ id: lessonBookings.id })

    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons[':lessonId'].resolve.$post({
      param: { lessonId: lesson.id },
      json: { action: 'complete', note: 'Reviewed' },
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)

    const updatedLesson = await db.query.lessons.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, lesson.id)
      },
      columns: { status: true, adminResolvedBy: true }
    })
    expect(updatedLesson?.status).toBe('completed')
    expect(updatedLesson?.adminResolvedBy).toBe(adminIdentity.id)

    const updatedBooking = await db.query.lessonBookings.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, booking.id)
      },
      columns: { status: true }
    })
    expect(updatedBooking?.status).toBe('completed')
  })

  it('allows admins to reschedule lessons and resets confirmations', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()
    await db.insert(tutorSubjects).values({ tutorId: tutor.id, subjectId: subject.id })

    const date = nextWeekDateForWeekday(2)
    const startAt = slotStartAt(date)
    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      availabilityId: availability.id,
      startAt,
      durationMinutes: 60,
      seats: 2,
      tutorConfirmed: true,
      tutorConfirmedAt: new Date()
    }).returning({ id: lessons.id })

    await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Reschedule me',
      studentConfirmed: true,
      studentConfirmedAt: new Date()
    })

    const newDate = nextWeekDateForWeekday(3)
    const newStartAt = slotStartAt(newDate)
    const [newAvailability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt: newStartAt,
      durationMinutes: 45,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons[':lessonId'].reschedule.$post({
      param: { lessonId: lesson.id },
      json: {
        availabilityId: newAvailability.id,
        note: 'Rescheduled by admin'
      },
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)

    const updatedLesson = await db.query.lessons.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, lesson.id)
      },
      columns: {
        availabilityId: true,
        startAt: true,
        durationMinutes: true,
        tutorConfirmed: true
      }
    })
    expect(updatedLesson?.availabilityId).toBe(newAvailability.id)
    expect(new Date(updatedLesson!.startAt).toISOString()).toBe(newStartAt.toISOString())
    expect(updatedLesson?.durationMinutes).toBe(45)
    expect(updatedLesson?.tutorConfirmed).toBeNull()

    const updatedBooking = await db.query.lessonBookings.findFirst({
      where(fields, operators) {
        return operators.eq(fields.lessonId, lesson.id)
      },
      columns: {
        studentConfirmed: true
      }
    })
    expect(updatedBooking?.studentConfirmed).toBeNull()
  })

  it('allows admins to reschedule lessons to a different tutor', async () => {
    const tutorA = await createTutor()
    const tutorB = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()
    await db.insert(tutorSubjects).values({ tutorId: tutorA.id, subjectId: subject.id })
    await db.insert(tutorSubjects).values({ tutorId: tutorB.id, subjectId: subject.id })

    const date = nextWeekDateForWeekday(2)
    const startAt = slotStartAt(date)
    const [availabilityA] = await db.insert(tutorAvailability).values({
      tutorId: tutorA.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const [lesson] = await db.insert(lessons).values({
      tutorId: tutorA.id,
      subjectId: subject.id,
      availabilityId: availabilityA.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })

    await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Move to tutor B'
    })

    const newDate = nextWeekDateForWeekday(3)
    const newStartAt = slotStartAt(newDate)
    const [availabilityB] = await db.insert(tutorAvailability).values({
      tutorId: tutorB.id,
      startAt: newStartAt,
      durationMinutes: 45,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons[':lessonId'].reschedule.$post({
      param: { lessonId: lesson.id },
      json: {
        availabilityId: availabilityB.id,
        note: 'Assign to tutor B'
      },
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)

    const updated = await db.query.lessons.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, lesson.id)
      },
      columns: { tutorId: true, availabilityId: true }
    })
    expect(updated?.tutorId).toBe(tutorB.id)
    expect(updated?.availabilityId).toBe(availabilityB.id)
  })

  it('allows admins to resolve stalled lessons as canceled with refunds', async () => {
    const tutor = await createTutor()
    const student = await createStudent(0)
    const subject = await createSubject()

    const startAt = pastLessonStart(3)
    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2,
      status: 'stalled'
    }).returning({ id: lessons.id })

    await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Resolved as cancel'
    })

    const adminToken = await issueToken(adminIdentity)
    const response = await lessonsClient.lessons[':lessonId'].resolve.$post({
      param: { lessonId: lesson.id },
      json: { action: 'cancel', note: 'Canceled by admin' },
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)

    const profile = await db.query.studentProfiles.findFirst({
      where(fields, operators) {
        return operators.eq(fields.userId, student.id)
      },
      columns: { lessonTokens: true }
    })
    expect(profile?.lessonTokens).toBe(1)
  })

  it('refunds tokens when student cancels before lesson day', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()
    await db.insert(tutorSubjects).values({ tutorId: tutor.id, subjectId: subject.id })

    const date = nextWeekDateForWeekday(2)
    const startAt = slotStartAt(date)
    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const studentToken = await tokenForStudent(student.id)

    const bookResponse = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'Quadratic equations'
      },
      header: bearer(studentToken)
    })
    const booked = await bookResponse.json() as { lesson: { id: string }, booking: { id: string } }

    const cancelResponse = await lessonsClient.lessons[':lessonId'].bookings[':bookingId'].$delete({
      param: { lessonId: booked.lesson.id, bookingId: booked.booking.id },
      header: bearer(studentToken)
    })
    expect(cancelResponse.status).toBe(HttpStatusCodes.NO_CONTENT)

    const profile = await db.query.studentProfiles.findFirst({
      where(fields, operators) {
        return operators.eq(fields.userId, student.id)
      },
      columns: { lessonTokens: true }
    })
    expect(profile?.lessonTokens).toBe(1)
  })

  it('does not refund tokens when a student cancels on the lesson day', async () => {
    const tutor = await createTutor()
    const student = await createStudent(0)
    const subject = await createSubject()

    const startAt = new Date()
    startAt.setHours(15, 0, 0, 0)

    const [lesson] = await db.insert(lessons).values({
      tutorId: tutor.id,
      subjectId: subject.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: lessons.id })

    const [booking] = await db.insert(lessonBookings).values({
      lessonId: lesson.id,
      studentId: student.id,
      topic: 'Same day cancel'
    }).returning({ id: lessonBookings.id })

    const studentToken = await tokenForStudent(student.id)
    const cancelResponse = await lessonsClient.lessons[':lessonId'].bookings[':bookingId'].$delete({
      param: { lessonId: lesson.id, bookingId: booking.id },
      header: bearer(studentToken)
    })
    expect(cancelResponse.status).toBe(HttpStatusCodes.NO_CONTENT)

    // Same-day cancellations do not refund tokens.
    const profile = await db.query.studentProfiles.findFirst({
      where(fields, operators) {
        return operators.eq(fields.userId, student.id)
      },
      columns: { lessonTokens: true }
    })
    expect(profile?.lessonTokens).toBe(0)
  })

  it('refunds tokens when admin cancels a lesson', async () => {
    const tutor = await createTutor()
    const student = await createStudent(1)
    const subject = await createSubject()
    await db.insert(tutorSubjects).values({ tutorId: tutor.id, subjectId: subject.id })

    const date = nextWeekDateForWeekday(2)
    const startAt = slotStartAt(date)
    const [availability] = await db.insert(tutorAvailability).values({
      tutorId: tutor.id,
      startAt,
      durationMinutes: 60,
      seats: 2
    }).returning({ id: tutorAvailability.id })

    const studentToken = await tokenForStudent(student.id)

    const bookResponse = await lessonsClient.tutors[':tutorId'].lessons.book.$post({
      param: { tutorId: tutor.id },
      json: {
        availabilityId: availability.id,
        subjectId: subject.id,
        topic: 'Polynomials'
      },
      header: bearer(studentToken)
    })
    const booked = await bookResponse.json() as { lesson: { id: string } }

    const adminToken = await issueToken(adminIdentity)
    const cancelResponse = await lessonsClient.lessons[':lessonId'].cancel.$post({
      param: { lessonId: booked.lesson.id },
      header: bearer(adminToken)
    })
    expect(cancelResponse.status).toBe(HttpStatusCodes.OK)

    const profile = await db.query.studentProfiles.findFirst({
      where(fields, operators) {
        return operators.eq(fields.userId, student.id)
      },
      columns: { lessonTokens: true }
    })
    expect(profile?.lessonTokens).toBe(1)
  })

  it('allows admins to adjust student tokens', async () => {
    const student = await createStudent(0)
    const adminToken = await issueToken(adminIdentity)

    const response = await tokensClient.students[':studentId'].tokens.adjust.$post({
      param: { studentId: student.id },
      json: {
        delta: 5,
        reason: 'bonus'
      },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as { lessonTokens: number }
    expect(body.lessonTokens).toBe(5)
  })
})
