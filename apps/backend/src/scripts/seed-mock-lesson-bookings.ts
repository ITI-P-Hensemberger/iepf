// Purpose: Seed mock lesson bookings and feedback for active users.
import { and, desc, eq, ilike, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import db, { closeDb } from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import { assertMockEnvironment, MOCK_STUDENT_PATTERN, MOCK_TUTOR_PATTERN } from '@/lib/mock-data'
import { tutorCanTeachStudent } from '@/lib/school-years'

function randomPick<T>(items: T[], count: number) {
  const copy = [...items]
  const result: T[] = []
  while (copy.length > 0 && result.length < count) {
    const index = Math.floor(Math.random() * copy.length)
    result.push(copy.splice(index, 1)[0]!)
  }
  return result
}

function sampleText(prefix: string) {
  const snippets = [
    'Lezione ben seguita.',
    'Buona partecipazione e attenzione.',
    'Ottimo impegno durante la lezione.',
    'Puoi migliorare la gestione del tempo.',
    'Continua così!'
  ]
  const snippet = snippets[Math.floor(Math.random() * snippets.length)]!
  return `${prefix} ${snippet}`
}

function pastDate(daysAgo: number, hour = 10) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, 0, 0, 0)
  return date
}

function getDateKey(date: Date) {
  return date.toISOString().split('T')[0]
}

async function main() {
  assertMockEnvironment()
  const activeStudents = await db
    .select({
      id: users.id,
      email: users.email,
      year: studentProfiles.year
    })
    .from(users)
    .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(and(eq(users.role, 'student'), eq(studentProfiles.isActive, true), ilike(users.email, MOCK_STUDENT_PATTERN)))

  const activeTutors = await db
    .select({
      id: users.id,
      email: users.email,
      year: tutorProfiles.year
    })
    .from(users)
    .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .where(and(eq(users.role, 'tutor'), eq(tutorProfiles.isActive, true), ilike(users.email, MOCK_TUTOR_PATTERN)))

  if (activeStudents.length === 0 || activeTutors.length === 0) {
    throw new Error('No active students or tutors found. Seed mock users first.')
  }
  const tutorYears = new Map(activeTutors.map(tutor => [tutor.id, tutor.year]))

  const scheduledLessons = await db
    .select({
      id: lessons.id,
      tutorId: lessons.tutorId,
      subjectId: lessons.subjectId,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      seats: lessons.seats,
      status: lessons.status
    })
    .from(lessons)
    .where(and(eq(lessons.status, 'scheduled'), inArray(lessons.tutorId, activeTutors.map(tutor => tutor.id))))
    .orderBy(desc(lessons.startAt))

  const tutorSettingsRows = scheduledLessons.length
    ? await db
        .select({
          tutorId: tutorSettings.tutorId,
          dailyCapacity: tutorSettings.dailyCapacity
        })
        .from(tutorSettings)
        .where(inArray(tutorSettings.tutorId, scheduledLessons.map(lesson => lesson.tutorId)))
    : []

  const tutorDailyCapacities = new Map<string, number>()
  for (const row of tutorSettingsRows) {
    tutorDailyCapacities.set(row.tutorId, row.dailyCapacity)
  }

  const lessonIds = scheduledLessons.map(lesson => lesson.id)
  const existingBookings = lessonIds.length
    ? await db
        .select({
          lessonId: lessonBookings.lessonId,
          studentId: lessonBookings.studentId,
          status: lessonBookings.status
        })
        .from(lessonBookings)
        .where(inArray(lessonBookings.lessonId, lessonIds))
    : []

  const lessonById = new Map(scheduledLessons.map(lesson => [lesson.id, lesson]))

  const bookingByLesson = new Map<string, Set<string>>()
  const dailyBookingsByTutor = new Map<string, number>()
  for (const booking of existingBookings) {
    if (booking.status !== 'confirmed') {
      continue
    }
    const set = bookingByLesson.get(booking.lessonId) ?? new Set<string>()
    set.add(booking.studentId)
    bookingByLesson.set(booking.lessonId, set)
    const lesson = lessonById.get(booking.lessonId)
    if (lesson) {
      const key = `${lesson.tutorId}:${getDateKey(new Date(lesson.startAt))}`
      dailyBookingsByTutor.set(key, (dailyBookingsByTutor.get(key) ?? 0) + 1)
    }
  }

  const tutorSubjectRows = await db
    .select({
      tutorId: tutorSubjects.tutorId,
      subjectId: tutorSubjects.subjectId
    })
    .from(tutorSubjects)
    .where(inArray(tutorSubjects.tutorId, activeTutors.map(tutor => tutor.id)))

  // An open lesson takes the subject of its first booking, as a real booking would set it.
  const lessonSubjects = new Map<string, string>()
  for (const lesson of scheduledLessons) {
    const subjectId = lesson.subjectId
      ?? randomPick(tutorSubjectRows.filter(row => row.tutorId === lesson.tutorId), 1)[0]?.subjectId
    if (subjectId) {
      lessonSubjects.set(lesson.id, subjectId)
    }
  }

  let createdBookings = 0
  const bookingRows: Array<typeof lessonBookings.$inferInsert> = []

  for (const lesson of scheduledLessons) {
    const subjectId = lessonSubjects.get(lesson.id)
    if (!subjectId) {
      continue
    }
    const existing = bookingByLesson.get(lesson.id) ?? new Set<string>()
    const availableSeats = Math.max(0, lesson.seats - existing.size)
    const dailyCapacity = tutorDailyCapacities.get(lesson.tutorId) ?? 1
    const dailyKey = `${lesson.tutorId}:${getDateKey(new Date(lesson.startAt))}`
    const currentDaily = dailyBookingsByTutor.get(dailyKey) ?? 0
    const availableDaily = Math.max(0, dailyCapacity - currentDaily)
    const available = Math.min(availableSeats, availableDaily)
    if (available <= 0) {
      continue
    }

    const desired = Math.min(available, 2)
    const selectedStudents = randomPick(
      activeStudents.filter(student => !existing.has(student.id)
        && tutorCanTeachStudent(tutorYears.get(lesson.tutorId)!, student.year)),
      desired
    )

    for (const student of selectedStudents) {
      bookingRows.push({
        id: randomUUID(),
        lessonId: lesson.id,
        studentId: student.id,
        subjectId,
        topic: 'Esercitazione',
        status: 'confirmed'
      })
      existing.add(student.id)
      dailyBookingsByTutor.set(dailyKey, (dailyBookingsByTutor.get(dailyKey) ?? 0) + 1)
      createdBookings += 1
    }
  }

  if (bookingRows.length > 0) {
    await db.insert(lessonBookings).values(bookingRows)

    await db.insert(tokenLedger).values(
      bookingRows.map(row => ({
        studentId: row.studentId!,
        lessonId: row.lessonId!,
        delta: -1,
        reason: 'lesson_booking'
      }))
    )
  }

  // Edge cases: canceled bookings and rebookings for the same lesson/student.
  const canceledPairs = randomPick(bookingRows, Math.min(5, bookingRows.length))
  if (canceledPairs.length > 0) {
    const refundRows: Array<typeof tokenLedger.$inferInsert> = []
    for (const row of canceledPairs) {
      const lesson = lessonById.get(row.lessonId!)
      const countsForStudent = Math.random() > 0.5
      await db.update(lessonBookings)
        .set({
          status: 'canceled',
          canceledAt: new Date(),
          canceledBy: row.studentId ?? null,
          countsForStudent
        })
        .where(eq(lessonBookings.id, row.id!))

      if (!countsForStudent) {
        refundRows.push({
          studentId: row.studentId!,
          lessonId: row.lessonId!,
          delta: 1,
          reason: 'lesson_cancel_admin'
        })
      }

      if (lesson) {
        const dailyKey = `${lesson.tutorId}:${getDateKey(new Date(lesson.startAt))}`
        const current = dailyBookingsByTutor.get(dailyKey) ?? 0
        dailyBookingsByTutor.set(dailyKey, Math.max(0, current - 1))
      }
      const existing = bookingByLesson.get(row.lessonId!) ?? new Set<string>()
      existing.delete(row.studentId!)
      bookingByLesson.set(row.lessonId!, existing)
    }

    if (refundRows.length > 0) {
      await db.insert(tokenLedger).values(refundRows)
    }

    const rebookRows: Array<typeof lessonBookings.$inferInsert> = []
    for (const row of canceledPairs) {
      const lesson = lessonById.get(row.lessonId!)
      if (!lesson) {
        continue
      }
      const existing = bookingByLesson.get(row.lessonId!) ?? new Set<string>()
      const availableSeats = Math.max(0, lesson.seats - existing.size)
      const dailyCapacity = tutorDailyCapacities.get(lesson.tutorId) ?? 1
      const dailyKey = `${lesson.tutorId}:${getDateKey(new Date(lesson.startAt))}`
      const currentDaily = dailyBookingsByTutor.get(dailyKey) ?? 0
      const availableDaily = Math.max(0, dailyCapacity - currentDaily)
      const available = Math.min(availableSeats, availableDaily)
      if (available <= 0 || existing.has(row.studentId!)) {
        continue
      }
      rebookRows.push({
        id: randomUUID(),
        lessonId: row.lessonId!,
        studentId: row.studentId!,
        subjectId: row.subjectId,
        topic: 'Rebooking',
        status: 'confirmed'
      })
      existing.add(row.studentId!)
      bookingByLesson.set(row.lessonId!, existing)
      dailyBookingsByTutor.set(dailyKey, currentDaily + 1)
    }

    if (rebookRows.length > 0) {
      await db.insert(lessonBookings).values(rebookRows)
      await db.insert(tokenLedger).values(
        rebookRows.map(row => ({
          studentId: row.studentId!,
          lessonId: row.lessonId!,
          delta: -1,
          reason: 'lesson_booking'
        }))
      )
      createdBookings += rebookRows.length
    }
  }

  const lessonsToConfirm = new Set<string>()
  for (const booking of bookingRows) {
    lessonsToConfirm.add(booking.lessonId)
  }
  for (const lessonId of lessonsToConfirm) {
    await db
      .update(lessons)
      .set({
        status: 'confirmed',
        subjectId: lessonSubjects.get(lessonId)
      })
      .where(eq(lessons.id, lessonId))
  }

  const combos: Array<{ tutorId: string, subjectId: string }> = tutorSubjectRows.length
    ? tutorSubjectRows
    : activeTutors
        .map(tutor => ({
          tutorId: tutor.id,
          subjectId: scheduledLessons.find(lesson => lesson.tutorId === tutor.id)?.subjectId
        }))
        .filter((combo): combo is { tutorId: string, subjectId: string } => Boolean(combo.subjectId))

  const pastLessonsToCreate = randomPick(combos, Math.min(5, combos.length))
  const pastLessonRows: Array<typeof lessons.$inferInsert> = pastLessonsToCreate.map((combo, index) => ({
    id: randomUUID(),
    tutorId: combo.tutorId,
    subjectId: combo.subjectId,
    startAt: pastDate(2 + index, 9 + index),
    durationMinutes: 60,
    seats: 2,
    status: 'confirmed',
    countsForTutor: Math.random() > 0.3,
    generatedByJob: false
  }))

  if (pastLessonRows.length > 0) {
    await db.insert(lessons).values(pastLessonRows)
  }

  const pastBookingRows: Array<typeof lessonBookings.$inferInsert> = []
  for (const lesson of pastLessonRows) {
    const student = randomPick(activeStudents, 1)[0]
    if (!student) {
      continue
    }
    pastBookingRows.push({
      id: randomUUID(),
      lessonId: lesson.id!,
      studentId: student.id,
      subjectId: lesson.subjectId!,
      topic: 'Ripasso',
      status: 'confirmed'
    })
  }

  if (pastBookingRows.length > 0) {
    await db.insert(lessonBookings).values(pastBookingRows)
    await db.insert(tokenLedger).values(
      pastBookingRows.map(row => ({
        studentId: row.studentId!,
        lessonId: row.lessonId!,
        delta: -1,
        reason: 'lesson_booking'
      }))
    )
  }

  const feedbackRows: Array<typeof lessonFeedback.$inferInsert> = []
  for (const booking of pastBookingRows) {
    const lesson = pastLessonRows.find(row => row.id === booking.lessonId)
    if (!lesson) {
      continue
    }

    const shouldHaveStudentFeedback = Math.random() > 0.2
    const shouldHaveTutorFeedback = Math.random() > 0.1

    if (shouldHaveStudentFeedback) {
      feedbackRows.push({
        id: randomUUID(),
        lessonId: lesson.id!,
        bookingId: booking.id!,
        authorUserId: booking.studentId!,
        targetUserId: lesson.tutorId!,
        authorRole: 'student',
        rating: Math.floor(Math.random() * 5) + 1,
        text: Math.random() > 0.5
          ? sampleText('Tutor')
          : null
      })
    }

    if (shouldHaveTutorFeedback) {
      feedbackRows.push({
        id: randomUUID(),
        lessonId: lesson.id!,
        bookingId: booking.id!,
        authorUserId: lesson.tutorId!,
        targetUserId: booking.studentId!,
        authorRole: 'tutor',
        rating: Math.floor(Math.random() * 5) + 1,
        text: sampleText('Studente')
      })
    }
  }

  if (feedbackRows.length > 0) {
    await db.insert(lessonFeedback).values(feedbackRows)
  }

  process.stdout.write(`Seeded ${createdBookings} bookings, ${pastLessonRows.length} past lessons, ${feedbackRows.length} feedback entries.\n`)
}

main()
  .catch((error) => {
    console.error('Failed to seed mock lesson bookings.', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
