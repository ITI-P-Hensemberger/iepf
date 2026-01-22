// Purpose: Seed mock lesson bookings and feedback for active users.
import { and, desc, eq, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'

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

async function main() {
  const activeStudents = await db
    .select({
      id: users.id,
      email: users.email
    })
    .from(users)
    .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(and(eq(users.role, 'student'), eq(studentProfiles.isActive, true)))

  const activeTutors = await db
    .select({
      id: users.id,
      email: users.email
    })
    .from(users)
    .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .where(and(eq(users.role, 'tutor'), eq(tutorProfiles.isActive, true)))

  if (activeStudents.length === 0 || activeTutors.length === 0) {
    throw new Error('No active students or tutors found. Seed mock users first.')
  }

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
    .where(eq(lessons.status, 'scheduled'))
    .orderBy(desc(lessons.startAt))

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

  const bookingByLesson = new Map<string, Set<string>>()
  for (const booking of existingBookings) {
    const set = bookingByLesson.get(booking.lessonId) ?? new Set<string>()
    set.add(booking.studentId)
    bookingByLesson.set(booking.lessonId, set)
  }

  let createdBookings = 0
  const bookingRows: Array<typeof lessonBookings.$inferInsert> = []

  for (const lesson of scheduledLessons) {
    const existing = bookingByLesson.get(lesson.id) ?? new Set<string>()
    const availableSeats = Math.max(0, lesson.seats - existing.size)
    if (availableSeats <= 0) {
      continue
    }

    const desired = Math.min(availableSeats, 2)
    const selectedStudents = randomPick(activeStudents.filter(student => !existing.has(student.id)), desired)

    for (const student of selectedStudents) {
      bookingRows.push({
        id: randomUUID(),
        lessonId: lesson.id,
        studentId: student.id,
        topic: 'Esercitazione',
        status: 'confirmed'
      })
      existing.add(student.id)
      createdBookings += 1
    }
  }

  if (bookingRows.length > 0) {
    await db.insert(lessonBookings).values(bookingRows)
  }

  // Edge cases: canceled bookings and rebookings for the same lesson/student.
  const canceledPairs = randomPick(bookingRows, Math.min(5, bookingRows.length))
  if (canceledPairs.length > 0) {
    const canceledIds = canceledPairs
      .map(row => row.id)
      .filter((id): id is string => Boolean(id))
    if (canceledIds.length > 0) {
      await db.update(lessonBookings)
        .set({
          status: 'canceled',
          canceledAt: new Date(),
          canceledBy: canceledPairs[0]?.studentId ?? null,
          countsForStudent: Math.random() > 0.5
        })
        .where(inArray(lessonBookings.id, canceledIds))

      const rebookRows: Array<typeof lessonBookings.$inferInsert> = canceledPairs.map(row => ({
        id: randomUUID(),
        lessonId: row.lessonId!,
        studentId: row.studentId!,
        topic: 'Rebooking',
        status: 'confirmed'
      }))

      await db.insert(lessonBookings).values(rebookRows)
      createdBookings += rebookRows.length
    }
  }

  const lessonsToConfirm = new Set<string>()
  for (const booking of bookingRows) {
    lessonsToConfirm.add(booking.lessonId)
  }
  if (lessonsToConfirm.size > 0) {
    await db
      .update(lessons)
      .set({ status: 'confirmed' })
      .where(inArray(lessons.id, Array.from(lessonsToConfirm)))
  }

  const tutorSubjectRows = await db
    .select({
      tutorId: tutorSubjects.tutorId,
      subjectId: tutorSubjects.subjectId
    })
    .from(tutorSubjects)
    .where(inArray(tutorSubjects.tutorId, activeTutors.map(tutor => tutor.id)))

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
      topic: 'Ripasso',
      status: 'confirmed'
    })
  }

  if (pastBookingRows.length > 0) {
    await db.insert(lessonBookings).values(pastBookingRows)
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
        text: Math.random() > 0.5 ? sampleText('Tutor') : null
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

main().catch((error) => {
  console.error('Failed to seed mock lesson bookings.', error)
  process.exit(1)
})
