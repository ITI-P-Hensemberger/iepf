// Purpose: Fill the local dev database with every lesson case the booking, tutor and admin views
// show, around today: open slots, slots locked by a first booking, full lessons, a tutor at
// daily capacity, canceled lessons, a lesson under way, past lessons with presence, next week.
// Safe to rerun: it replaces the lessons of the demo and scenario tutors each time.
// First, so the scenarios sit around the same simulated day as the server.
import '@/lib/fake-clock'
import { eq, inArray } from 'drizzle-orm'

import db, { closeDb } from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { hashPassword } from '@/lib/password'
import { addDays, schoolDayKey, schoolTime, weekdayOf } from '@/lib/school-time'

assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)

const SUBJECTS = {
  math: { name: 'Matematica', canonicalName: 'mathematics' },
  physics: { name: 'Fisica', canonicalName: 'physics' },
  english: { name: 'Inglese - Lingua', canonicalName: 'english' },
  science: { name: 'Scienze', canonicalName: 'science' },
  computing: { name: 'Informatica', canonicalName: 'computer_science' },
  // Nobody teaches it: the booking page shows it without lessons, to request it.
  history: { name: 'Storia', canonicalName: 'history' }
} as const
type SubjectKey = keyof typeof SUBJECTS

const TUTORS = [
  {
    alias: 'sara',
    firstName: 'Sara',
    lastName: 'Pellegrini',
    year: 5,
    capacity: 3,
    subjects: ['math', 'science']
  },
  {
    alias: 'luca',
    firstName: 'Luca',
    lastName: 'Verdi',
    year: 5,
    capacity: 1,
    subjects: ['computing']
  },
  {
    alias: 'giulia',
    firstName: 'Giulia',
    lastName: 'Bianchi',
    year: 3,
    capacity: 2,
    subjects: ['english', 'math']
  }
] as const

const STUDENTS = [
  {
    alias: 'anna',
    firstName: 'Anna',
    lastName: 'Villa',
    year: 1,
    tokens: 8
  },
  {
    alias: 'marco',
    firstName: 'Marco',
    lastName: 'Galli',
    year: 2,
    tokens: 8
  },
  {
    alias: 'elena',
    firstName: 'Elena',
    lastName: 'Riva',
    year: 1,
    tokens: 8
  },
  {
    alias: 'paolo',
    firstName: 'Paolo',
    lastName: 'Conti',
    year: 2,
    tokens: 8
  },
  // Year 3: lessons by a year-3 tutor are hidden from them.
  {
    alias: 'irene',
    firstName: 'Irene',
    lastName: 'Sala',
    year: 3,
    tokens: 8
  },
  // No hours left: sees lessons but cannot book.
  {
    alias: 'zero',
    firstName: 'Zeno',
    lastName: 'Ore',
    year: 1,
    tokens: 0
  }
] as const

const email = (alias: string) => `scenario.${alias}@example.test`

async function upsertUser(alias: string, firstName: string, lastName: string, role: 'tutor' | 'student', passwordHash: string) {
  // A rerun resets the password, so every scenario account opens with the demo one.
  await db.insert(users).values({
    email: email(alias),
    firstName,
    lastName,
    passwordHash,
    role,
    emailVerifiedAt: new Date()
  }).onConflictDoUpdate({
    target: users.email,
    set: { passwordHash }
  })
  const user = await db.query.users.findFirst({
    where: (fields, ops) => ops.eq(fields.email, email(alias)),
    columns: { id: true }
  })
  return user!.id
}

async function main() {
  const ids = await seedDevelopmentData()
  const passwordHash = await hashPassword(DEV_PASSWORD)
  const [section] = await db.query.classSections.findMany({ limit: 1 })

  const subjectIds = {} as Record<SubjectKey, string>
  for (const [key, subject] of Object.entries(SUBJECTS) as Array<[SubjectKey, typeof SUBJECTS[SubjectKey]]>) {
    await db.insert(subjects).values(subject).onConflictDoNothing({ target: subjects.canonicalName })
    const row = await db.query.subjects.findFirst({
      where: (fields, ops) => ops.eq(fields.canonicalName, subject.canonicalName),
      columns: { id: true }
    })
    subjectIds[key] = row!.id
  }
  const devMath = (await db.query.tutorSubjects.findFirst({
    where: (fields, ops) => ops.eq(fields.tutorId, ids.tutor),
    columns: { subjectId: true }
  }))!.subjectId

  // The demo tutor teaches three subjects with two seats a day.
  const tutorIds: Record<string, string> = { demo: ids.tutor }
  await db.delete(tutorSubjects).where(eq(tutorSubjects.tutorId, ids.tutor))
  await db.insert(tutorSubjects).values([devMath, subjectIds.physics, subjectIds.english].map(subjectId => ({ tutorId: ids.tutor, subjectId })))
  await db.update(tutorSettings).set({ dailyCapacity: 2 }).where(eq(tutorSettings.tutorId, ids.tutor))
  for (const tutor of TUTORS) {
    const id = await upsertUser(`tutor-${tutor.alias}`, tutor.firstName, tutor.lastName, 'tutor', passwordHash)
    tutorIds[tutor.alias] = id
    await db.insert(tutorProfiles).values({
      userId: id,
      sectionId: section.id,
      year: tutor.year,
      isActive: true
    }).onConflictDoNothing()
    await db.insert(tutorSettings).values({ tutorId: id, dailyCapacity: tutor.capacity }).onConflictDoUpdate({
      target: tutorSettings.tutorId,
      set: { dailyCapacity: tutor.capacity }
    })
    await db.delete(tutorSubjects).where(eq(tutorSubjects.tutorId, id))
    await db.insert(tutorSubjects).values(tutor.subjects.map(key => ({ tutorId: id, subjectId: subjectIds[key] })))
  }

  const studentIds: Record<string, string> = { demo: ids.student }
  for (const student of STUDENTS) {
    const id = await upsertUser(`student-${student.alias}`, student.firstName, student.lastName, 'student', passwordHash)
    studentIds[student.alias] = id
    await db.insert(studentProfiles).values({
      userId: id,
      sectionId: section.id,
      year: student.year,
      isActive: true
    }).onConflictDoNothing()
  }

  // Start over: the scenario owns these tutors' lessons and these students' hours.
  await db.delete(lessons).where(inArray(lessons.tutorId, Object.values(tutorIds)))
  await db.delete(tokenLedger).where(inArray(tokenLedger.studentId, Object.values(studentIds)))
  await db.insert(tokenLedger).values([
    { studentId: ids.student, delta: 10, reason: 'initial_grant' },
    ...STUDENTS.filter(student => student.tokens > 0).map(student => ({ studentId: studentIds[student.alias], delta: student.tokens, reason: 'initial_grant' }))
  ])

  const now = new Date()
  const today = schoolDayKey(now)
  const monday = addDays(today, 1 - weekdayOf(today))
  const weekDays = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map(offset => addDays(monday, offset))
  let created = 0
  let booked = 0

  interface Booking { student: string, subject: SubjectKey | 'devMath', topic: string, status?: 'confirmed' | 'canceled', presence?: boolean | null }
  const subjectOf = (key: SubjectKey | 'devMath') => key === 'devMath'
    ? devMath
    : subjectIds[key]

  async function lesson(tutor: string, startAt: Date, options: { subject?: SubjectKey | 'devMath', fixed?: boolean, status?: string, seats?: number, bookings?: Booking[] } = {}) {
    const confirmed = (options.bookings ?? []).filter(booking => (booking.status ?? 'confirmed') === 'confirmed')
    const firstSubject = confirmed[0]?.subject ?? options.subject
    const fixed = options.fixed === true
    const [row] = await db.insert(lessons).values({
      tutorId: tutorIds[tutor],
      // A booked or admin-made lesson has a subject; a generated one waits for its first booking.
      subjectId: fixed || confirmed.length > 0
        ? subjectOf(firstSubject!)
        : null,
      subjectFromBooking: !fixed,
      startAt,
      durationMinutes: 60,
      seats: options.seats ?? (await db.query.tutorSettings.findFirst({
        where: (fields, ops) => ops.eq(fields.tutorId, tutorIds[tutor])
      }))!.dailyCapacity,
      status: options.status ?? (confirmed.length > 0
        ? 'confirmed'
        : 'scheduled'),
      countsForTutor: confirmed.some(booking => booking.presence != null),
      generatedByJob: !fixed
    }).returning({ id: lessons.id })
    created += 1
    for (const booking of options.bookings ?? []) {
      const status = booking.status ?? 'confirmed'
      await db.insert(lessonBookings).values({
        lessonId: row.id,
        studentId: studentIds[booking.student],
        subjectId: subjectOf(booking.subject),
        topic: booking.topic,
        status,
        studentPresence: booking.presence ?? null,
        studentPresenceAt: booking.presence == null
          ? null
          : new Date(startAt.getTime() + 10 * 60_000),
        canceledAt: status === 'canceled'
          ? new Date(startAt.getTime() - 3 * 24 * 60 * 60_000)
          : null,
        canceledBy: status === 'canceled'
          ? studentIds[booking.student]
          : null,
        countsForStudent: status === 'confirmed'
      })
      await db.insert(tokenLedger).values({
        studentId: studentIds[booking.student],
        lessonId: row.id,
        delta: -1,
        reason: 'lesson_booking'
      })
      if (status === 'canceled') {
        await db.insert(tokenLedger).values({
          studentId: studentIds[booking.student],
          lessonId: row.id,
          delta: 1,
          reason: 'lesson_cancel_student'
        })
      }
      booked += 1
    }
    return row.id
  }

  // Cases hang on the next lesson days, so the seed shows them all whatever day it runs.
  const demoDays = weekDays.filter(day => day > today && [1, 3, 5].includes(weekdayOf(day)))
  const firstThursday = weekDays.find(day => day > today && weekdayOf(day) === 4)

  for (const [index, day] of weekDays.entries()) {
    const at = (hour: number) => schoolTime(day, hour)
    const past = day < today
    const isToday = day === today
    const weekday = weekdayOf(day)

    // Demo tutor: Monday, Wednesday, Friday at 14:00 and 15:00, like the dev availability.
    if ([1, 3, 5].includes(weekday)) {
      if (past) {
        await lesson('demo', at(14), {
          bookings: [
            {
              student: 'demo',
              subject: 'devMath',
              topic: 'Disequazioni fratte',
              presence: true
            },
            {
              student: 'anna',
              subject: 'devMath',
              topic: 'Sistemi lineari',
              presence: false
            }
          ]
        })
        await lesson('demo', at(15), {
          bookings: [
            {
              student: 'marco',
              subject: 'physics',
              topic: 'Moto rettilineo uniforme',
              presence: null
            }
          ]
        })
      }
      else if (day === demoDays[0]) {
        // Next lesson day: 14:00 already locked to Physics with one seat left, 15:00 still open.
        await lesson('demo', at(14), {
          bookings: [
            { student: 'anna', subject: 'physics', topic: 'Leggi di Newton, esercizi pag. 88' }
          ]
        })
        await lesson('demo', at(15))
      }
      else if (day === demoDays[1]) {
        // A slot whose only booking was canceled: open again, the booking keeps its subject.
        await lesson('demo', at(14), {
          bookings: [
            {
              student: 'elena',
              subject: 'english',
              topic: 'Past simple',
              status: 'canceled'
            }
          ]
        })
        // Full: both of the tutor's daily seats taken.
        await lesson('demo', at(15), {
          bookings: [
            { student: 'paolo', subject: 'devMath', topic: 'Logaritmi' },
            { student: 'marco', subject: 'devMath', topic: 'Esponenziali' }
          ]
        })
      }
      else if (!isToday) {
        // Untouched, as the Saturday job leaves them.
        await lesson('demo', at(14))
        await lesson('demo', at(15))
      }
    }

    // Sara (5ª, Matematica e Scienze, 3 posti): every weekday at 14:00, Tuesday and Thursday also at 15:00.
    if (past) {
      await lesson('sara', at(14), {
        bookings: [
          {
            student: 'paolo',
            subject: 'science',
            topic: 'La cellula',
            presence: true
          }
        ]
      })
    }
    else if (!isToday) {
      await lesson('sara', at(14), index % 2 === 0
        ? {}
        : {
            bookings: [
              { student: 'elena', subject: 'math', topic: 'Frazioni algebriche' }
            ]
          })
      if ([2, 4].includes(weekday)) {
        // Canceled by the tutor: shown struck through to the admin, gone for students.
        await lesson('sara', at(15), {
          status: day === firstThursday
            ? 'canceled'
            : undefined
        })
      }
    }

    // Luca (Informatica, 1 posto al giorno): 14:00 booked, so 15:00 is open but not bookable.
    if (!past && !isToday && weekday === 2) {
      await lesson('luca', at(14), {
        bookings: [
          { student: 'marco', subject: 'computing', topic: 'Cicli for in Python' }
        ]
      })
      await lesson('luca', at(15))
    }
    if (!past && !isToday && weekday === 4) {
      // Made by an admin with a fixed subject: bookings cannot change it.
      await lesson('luca', at(15), { subject: 'computing', fixed: true })
    }

    // Giulia (3ª): only year-1 and year-2 students see her lessons.
    if (!past && !isToday && [3, 5].includes(weekday)) {
      await lesson('giulia', at(15))
    }
  }

  // Today, on a school day: a lesson under way (presence can be marked) and one nobody booked.
  if (weekdayOf(today) <= 5) {
    const started = new Date(Math.floor((now.getTime() - 30 * 60_000) / (5 * 60_000)) * 5 * 60_000)
    await lesson('demo', started, {
      bookings: [
        { student: 'paolo', subject: 'devMath', topic: 'Equazioni di secondo grado' },
        { student: 'irene', subject: 'devMath', topic: 'Parabola e retta' }
      ]
    })
    await lesson('sara', new Date(started.getTime() + 60 * 60_000))
  }

  // The demo student already has a lesson on the first bookable Tuesday: that day shows as taken.
  const tuesday = weekDays.find(day => day > addDays(today, 1) && weekdayOf(day) === 2)
  if (tuesday) {
    await lesson('giulia', schoolTime(tuesday, 14), {
      bookings: [
        { student: 'demo', subject: 'english', topic: 'Present perfect' }
      ]
    })
  }

  process.stdout.write(`${[
    `Lesson scenarios ready: ${created} lessons, ${booked} bookings around ${today}.`,
    `Password for every account: ${DEV_PASSWORD}`,
    'Student (year 2, 10 hours): student@example.test — also scenario.student-anna|marco|elena|paolo|irene|zero@example.test',
    'Tutor with three subjects: tutor@example.test — also scenario.tutor-sara|luca|giulia@example.test',
    'Admin: admin@example.test'
  ].join('\n')}\n`)
}

try {
  await main()
}
catch (error) {
  console.error('Lesson scenario seed failed.', error)
  process.exitCode = 1
}
finally {
  await closeDb()
}
