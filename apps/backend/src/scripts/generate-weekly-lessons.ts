// Purpose: Generate weekly lessons based on tutor weekday availability.
import { and, eq, ilike } from 'drizzle-orm'

import db, { closeDb } from '@/db'
import { lessons } from '@/db/schemas/lessons.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { DEFAULT_TUTOR_SETTINGS } from '@/lib/constants'
import { buildLessonsGeneratedMessage } from '@/lib/email-templates'
import { notifyStudentsOfNewLessons } from '@/lib/lessons-available'
import { createMailBatch } from '@/lib/mail-batch'
import { closeMailer } from '@/lib/mailer'
import { assertMockEnvironment, MOCK_TUTOR_PATTERN } from '@/lib/mock-data'
import { lessonsGeneratedPush } from '@/lib/push-messages'
import { createPushBatch } from '@/lib/reminder-delivery'

function getNextWeekMonday(): Date {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(monday.getDate() + daysUntilMonday)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getCurrentWeekMonday(): Date {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(now)
  monday.setDate(monday.getDate() - daysSinceMonday)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getStartOfTomorrow(): Date {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  return tomorrow
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

async function getActiveTutors(mockOnly: boolean) {
  return db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      year: tutorProfiles.year
    })
    .from(users)
    .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .where(
      and(
        eq(users.role, 'tutor'),
        eq(tutorProfiles.isActive, true),
        ...(mockOnly ? [ilike(users.email, MOCK_TUTOR_PATTERN)] : [])
      )
    )
}

async function getTutorSettings(tutorId: string) {
  const settings = await db.query.tutorSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: {
      dailyCapacity: true
    }
  })

  return settings ?? DEFAULT_TUTOR_SETTINGS
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function getClosureDates() {
  const row = await db.query.globalSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.key, 'closureDates')
    },
    columns: { value: true }
  })

  return Array.isArray(row?.value) ? (row?.value as string[]) : []
}

async function getTutorAvailableWeekdays(tutorId: string) {
  return db.query.tutorWeekdayAvailability.findMany({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.eq(fields.isAvailable, true)
      )
    },
    columns: { weekday: true, startTime: true }
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
  const args = new Set(process.argv.slice(2))
  const mockOnly = args.has('--mock-only')
  if (mockOnly) {
    assertMockEnvironment()
  }
  const useToday = args.has('today') || args.has('--today')
  const targetMonday = useToday ? getCurrentWeekMonday() : getNextWeekMonday()
  const minLessonDate = useToday ? getStartOfTomorrow() : null

  process.stdout.write(`Generating lessons for week starting ${targetMonday.toISOString().split('T')[0]}\n`)
  if (useToday) {
    process.stdout.write(`Limiting to lessons from ${minLessonDate!.toISOString().split('T')[0]} through end of week\n`)
  }

  const activeTutors = await getActiveTutors(mockOnly)
  process.stdout.write(`Found ${activeTutors.length} active tutors\n`)

  let totalCreated = 0
  let totalSkipped = 0
  const closureDates = await getClosureDates()
  const closureDateSet = new Set(closureDates)
  const mailBatch = createMailBatch()
  const pushBatch = createPushBatch()
  const teachingYears: number[] = []

  for (const tutor of activeTutors) {
    let createdForTutor = 0
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
      if (!availability.startTime) {
        continue
      }

      const lessonDate = getWeekdayDate(targetMonday, availability.weekday)
      if (minLessonDate && lessonDate < minLessonDate) {
        continue
      }
      if (closureDateSet.has(formatDateKey(lessonDate))) {
        continue
      }
      const startTimes = availability.startTime === '14:00-16:00'
        ? ['14:00', '15:00']
        : [availability.startTime]

      for (const startTime of startTimes) {
        const startAt = combineDateAndTime(lessonDate, startTime)
        for (const subjectId of subjectIds) {
          const exists = await lessonExists(tutor.id, subjectId, startAt, targetMonday)

          if (exists) {
            totalSkipped += 1
            continue
          }

          await db.insert(lessons).values({
            tutorId: tutor.id,
            subjectId,
            startAt,
            durationMinutes: 60,
            seats: settings.dailyCapacity,
            generatedByJob: true,
            generatedForWeek: targetMonday
          })

          totalCreated += 1
          createdForTutor += 1
        }
      }
    }

    if (createdForTutor > 0 && tutor.email) {
      const tutorName = `${tutor.firstName} ${tutor.lastName}`.trim()
      const message = buildLessonsGeneratedMessage({
        tutorName: tutorName || 'Tutor',
        count: createdForTutor,
        weekStart: targetMonday
      })
      mailBatch.send({
        to: tutor.email,
        subject: message.subject,
        text: message.text,
        html: message.html
      })
    }
    if (createdForTutor > 0) {
      teachingYears.push(tutor.year)
      pushBatch.send(tutor.id, 'lessons', lessonsGeneratedPush({ count: createdForTutor, weekStart: targetMonday }))
    }
  }

  const studentsNotified = await notifyStudentsOfNewLessons(pushBatch, targetMonday, teachingYears)
  await pushBatch.finish()
  await mailBatch.finish()
  if (studentsNotified > 0) {
    process.stdout.write(`Told ${studentsNotified} student(s) about the new lessons\n`)
  }
  process.stdout.write(`Complete: ${totalCreated} lessons created, ${totalSkipped} skipped (already exist)\n`)
}

main()
  .catch((error) => {
    console.error('Failed to generate weekly lessons.', error)
    process.exitCode = 1
  })
  .finally(async () => {
    closeMailer()
    await closeDb()
  })
