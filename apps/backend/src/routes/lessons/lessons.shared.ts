// Purpose: Helpers shared by the lesson handlers: access checks, capacity counts and email details.
import type { Context } from 'hono'

import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { BookingOutcome } from '@/lib/analytics'
import type { DbExecutor, DbTransaction } from '@/lib/lesson-tokens'
import type { AppBindings } from '@/lib/types'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { classLabel as schoolClassLabel } from '@/lib/class-label'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { schoolDayKey, schoolDayRange } from '@/lib/school-time'

export type HandlerContext = Context<AppBindings>

export function forbid(): never {
  throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
    message: HttpStatusPhrases.FORBIDDEN
  })
}

export function ensureAdmin(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    forbid()
  }
  return currentUser
}

export interface LessonEmailDetails<S extends string | null> {
  lessonId: string
  // null for a lesson nobody booked yet: messages then leave the subject out.
  subjectName: S
  tutorName: string
  tutorEmail: string | null
}

export async function fetchLessonEmailDetails(lessonId: string, tutorId: string, subjectId: string): Promise<LessonEmailDetails<string> | null>
export async function fetchLessonEmailDetails(lessonId: string, tutorId: string, subjectId: string | null): Promise<LessonEmailDetails<string | null> | null>
export async function fetchLessonEmailDetails(lessonId: string, tutorId: string, subjectId: string | null): Promise<LessonEmailDetails<string | null> | null> {
  const [tutor, subject] = await Promise.all([
    db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, tutorId)
      },
      columns: { firstName: true, lastName: true, email: true }
    }),
    subjectId
      ? db.query.subjects.findFirst({
          where(fields, operators) {
            return operators.eq(fields.id, subjectId)
          },
          columns: { name: true }
        })
      : Promise.resolve({ name: null })
  ])

  if (!tutor || !subject) {
    return null
  }

  return {
    lessonId,
    subjectName: subject.name,
    tutorName: `${tutor.firstName} ${tutor.lastName}`,
    tutorEmail: tutor.email
  }
}

export async function fetchStudentsDetails(studentIds: string[]) {
  if (studentIds.length === 0) {
    return new Map<string, { name: string, email: string | null, classLabel: string | null }>()
  }

  const uniqueIds = Array.from(new Set(studentIds))
  const [students, profiles] = await Promise.all([
    db.query.users.findMany({
      where(fields, operators) {
        return operators.inArray(fields.id, uniqueIds)
      },
      columns: { id: true, firstName: true, lastName: true, email: true }
    }),
    db.query.studentProfiles.findMany({
      where(fields, operators) {
        return operators.inArray(fields.userId, uniqueIds)
      },
      columns: { userId: true, sectionId: true, year: true }
    })
  ])

  const sectionIds = Array.from(new Set(profiles.map(profile => profile.sectionId).filter(Boolean))) as string[]
  const sections = sectionIds.length > 0
    ? await db.query.classSections.findMany({
        where(fields, operators) {
          return operators.inArray(fields.id, sectionIds)
        },
        columns: { id: true, name: true }
      })
    : []

  const sectionNameMap = new Map(sections.map(section => [section.id, section.name]))
  const profileMap = new Map(profiles.map(profile => [profile.userId, profile]))

  return new Map(students.map((student) => {
    const profile = profileMap.get(student.id)
    const sectionName = profile?.sectionId ? sectionNameMap.get(profile.sectionId) ?? null : null
    const classLabel = schoolClassLabel(profile?.year ?? null, sectionName)
    return [
      student.id,
      {
        name: `${student.firstName} ${student.lastName}`,
        email: student.email ?? null,
        classLabel
      }
    ]
  }))
}

// True once `now` is on the lesson's school day or later.
export function sameDayOrAfter(now: Date, lessonStart: Date) {
  return schoolDayKey(now) >= schoolDayKey(lessonStart)
}

export function rejection<S extends number>(message: string, status: S, reason?: BookingOutcome) {
  return { rejected: true as const, message, status, reason }
}

export async function getTutorDailyCapacity(tutorId: string, executor: DbExecutor = db): Promise<number> {
  const settings = await executor.query.tutorSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: { dailyCapacity: true }
  })
  return settings?.dailyCapacity ?? 1
}

export async function cancelConfirmedBookings(tx: DbTransaction, lessonId: string, adminId: string) {
  const bookings = await tx.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.lessonId, lessonId),
        operators.eq(fields.status, 'confirmed')
      )
    }
  })

  for (const booking of bookings) {
    await tx.update(lessonBookings)
      .set({
        status: 'canceled',
        canceledAt: new Date(),
        canceledBy: adminId,
        studentPresence: null,
        studentPresenceAt: null,
        countsForStudent: false
      })
      .where(eq(lessonBookings.id, booking.id))

    await tx.insert(tokenLedger).values({
      studentId: booking.studentId,
      lessonId,
      delta: 1,
      reason: 'lesson_cancel_admin'
    })
  }
}

export async function getTutorDailyBookingCount(tutorId: string, date: Date, executor: DbExecutor = db): Promise<number> {
  const day = schoolDayRange(date)

  const tutorLessons = await executor.query.lessons.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.gte(fields.startAt, day.start),
        operators.lt(fields.startAt, day.end)
      )
    },
    columns: { id: true }
  })

  if (tutorLessons.length === 0) {
    return 0
  }

  const lessonIds = tutorLessons.map(l => l.id)
  const bookings = await executor.query.lessonBookings.findMany({
    where(fields, operators) {
      return operators.and(
        operators.inArray(fields.lessonId, lessonIds),
        operators.eq(fields.status, 'confirmed')
      )
    },
    columns: { id: true }
  })

  return bookings.length
}

export async function getStudentDailyBookingCount(studentId: string, date: Date, executor: DbExecutor = db): Promise<number> {
  const day = schoolDayRange(date)

  const [{ total }] = await executor
    .select({ total: sql<number>`count(*)::int` })
    .from(lessonBookings)
    .innerJoin(lessons, eq(lessonBookings.lessonId, lessons.id))
    .where(and(
      eq(lessonBookings.studentId, studentId),
      eq(lessonBookings.status, 'confirmed'),
      gte(lessons.startAt, day.start),
      lt(lessons.startAt, day.end)
    ))

  return total ?? 0
}

export interface SubjectOption { id: string, name: string }

// The subjects each tutor teaches: what a booking may pick on an open lesson.
export async function getTutorSubjectOptions(tutorIds: string[]): Promise<Map<string, SubjectOption[]>> {
  const options = new Map<string, SubjectOption[]>()
  if (tutorIds.length === 0) {
    return options
  }
  const rows = await db
    .select({ tutorId: tutorSubjects.tutorId, id: subjects.id, name: subjects.name })
    .from(tutorSubjects)
    .innerJoin(subjects, eq(tutorSubjects.subjectId, subjects.id))
    .where(inArray(tutorSubjects.tutorId, [...new Set(tutorIds)]))
    .orderBy(asc(subjects.name))
  for (const row of rows) {
    const list = options.get(row.tutorId) ?? []
    list.push({ id: row.id, name: row.name })
    options.set(row.tutorId, list)
  }
  return options
}

// A lesson matches a subject when it is for that subject, or is still open and its tutor teaches it.
export function lessonOffersSubject(subjectId: string) {
  return or(
    eq(lessons.subjectId, subjectId),
    and(
      isNull(lessons.subjectId),
      inArray(
        lessons.tutorId,
        db.select({ tutorId: tutorSubjects.tutorId }).from(tutorSubjects).where(eq(tutorSubjects.subjectId, subjectId))
      )
    )
  )!
}

// The subjects a booking may pick: the open lesson's tutor's subjects, or the subject already set.
export function subjectOptionsFor(lesson: { tutorId: string, subjectId: string | null, subjectName?: string | null }, tutorOptions: Map<string, SubjectOption[]>): SubjectOption[] {
  if (lesson.subjectId) {
    const name = lesson.subjectName ?? tutorOptions.get(lesson.tutorId)?.find(option => option.id === lesson.subjectId)?.name
    return name ? [{ id: lesson.subjectId, name }] : []
  }
  return tutorOptions.get(lesson.tutorId) ?? []
}
