// Purpose: Generate weekly lessons based on tutor weekday availability.
import { and, eq } from 'drizzle-orm'

import db from '@/db'
import { lessons } from '@/db/schemas/lessons.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { DEFAULT_TUTOR_SETTINGS } from '@/lib/constants'

function getNextWeekMonday(): Date {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(monday.getDate() + daysUntilMonday)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getWeekdayDate(monday: Date, weekday: number): Date {
  const date = new Date(monday)
  date.setDate(date.getDate() + (weekday - 1))
  return date
}

function combineDateAndTime(date: Date, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const combined = new Date(date)
  combined.setHours(hours, minutes, 0, 0)
  return combined
}

async function getActiveTutors() {
  return db
    .select({
      id: users.id
    })
    .from(users)
    .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .where(
      and(
        eq(users.role, 'tutor'),
        eq(tutorProfiles.isActive, true)
      )
    )
}

async function getTutorSettings(tutorId: string) {
  const settings = await db.query.tutorSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: {
      defaultStartTime: true,
      defaultDurationMinutes: true,
      dailyCapacity: true
    }
  })

  return settings ?? DEFAULT_TUTOR_SETTINGS
}

async function getTutorAvailableWeekdays(tutorId: string) {
  return db.query.tutorWeekdayAvailability.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.eq(fields.isAvailable, true)
      )
    },
    columns: { weekday: true }
  })
}

async function getTutorSubjectIds(tutorId: string) {
  const subjects = await db.query.tutorSubjects.findMany({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: { subjectId: true }
  })
  return subjects.map(s => s.subjectId)
}

async function lessonExists(tutorId: string, subjectId: string, startAt: Date, generatedForWeek: Date) {
  const existing = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.eq(fields.subjectId, subjectId),
        operators.eq(fields.startAt, startAt),
        operators.eq(fields.generatedForWeek, generatedForWeek)
      )
    },
    columns: { id: true }
  })
  return Boolean(existing)
}

async function main() {
  const nextMonday = getNextWeekMonday()
  process.stdout.write(`Generating lessons for week starting ${nextMonday.toISOString().split('T')[0]}\n`)

  const activeTutors = await getActiveTutors()
  process.stdout.write(`Found ${activeTutors.length} active tutors\n`)

  let totalCreated = 0
  let totalSkipped = 0

  for (const tutor of activeTutors) {
    const settings = await getTutorSettings(tutor.id)
    const availableWeekdays = await getTutorAvailableWeekdays(tutor.id)
    const subjectIds = await getTutorSubjectIds(tutor.id)

    if (availableWeekdays.length === 0) {
      continue
    }

    if (subjectIds.length === 0) {
      continue
    }

    for (const availability of availableWeekdays) {
      const lessonDate = getWeekdayDate(nextMonday, availability.weekday)
      const startAt = combineDateAndTime(lessonDate, settings.defaultStartTime)

      for (const subjectId of subjectIds) {
        const exists = await lessonExists(tutor.id, subjectId, startAt, nextMonday)

        if (exists) {
          totalSkipped += 1
          continue
        }

        await db.insert(lessons).values({
          tutorId: tutor.id,
          subjectId,
          startAt,
          durationMinutes: settings.defaultDurationMinutes,
          seats: settings.dailyCapacity,
          generatedByJob: true,
          generatedForWeek: nextMonday
        })

        totalCreated += 1
      }
    }
  }

  process.stdout.write(`Complete: ${totalCreated} lessons created, ${totalSkipped} skipped (already exist)\n`)
}

main().catch((error) => {
  console.error('Failed to generate weekly lessons.', error)
  process.exit(1)
})
