// Purpose: Generate weekly lessons based on tutor weekday availability.
import { and, eq, ilike } from 'drizzle-orm'

import db, { closeDb } from '@/db'
import { lessons } from '@/db/schemas/lessons.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { DEFAULT_TUTOR_SETTINGS } from '@/lib/constants'
import { buildLessonsGeneratedMessage } from '@/lib/email-templates'
import { notifyIfWeekEmpty } from '@/lib/empty-week'
import { notifyStudentsOfNewLessons } from '@/lib/lessons-available'
import { createMailBatch } from '@/lib/mail-batch'
import { closeMailer } from '@/lib/mailer'
import { assertMockEnvironment, MOCK_TUTOR_PATTERN } from '@/lib/mock-data'
import { recordNotifications } from '@/lib/notification-inbox'
import { lessonsGeneratedPush } from '@/lib/push-messages'
import { createPushBatch } from '@/lib/reminder-delivery'
import { addDays, schoolDayKey, schoolTime, weekdayOf } from '@/lib/school-time'

// Day keys are school days in Europe/Rome, whatever time zone the job runs in.
function getMondayKey(useToday: boolean): string {
  const todayKey = schoolDayKey(new Date())
  const weekday = weekdayOf(todayKey)
  return useToday
    ? addDays(todayKey, 1 - weekday)
    : addDays(todayKey, 8 - weekday)
}

function slotStart(dayKey: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  return schoolTime(dayKey, hours, minutes)
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
        ...(mockOnly
          ? [
              ilike(users.email, MOCK_TUTOR_PATTERN)
            ]
          : [])
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

async function getClosureDates() {
  const row = await db.query.globalSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.key, 'closureDates')
    },
    columns: { value: true }
  })

  return Array.isArray(row?.value)
    ? (row?.value as string[])
    : []
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

async function tutorHasSubjects(tutorId: string) {
  const subject = await db.query.tutorSubjects.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tutorId, tutorId)
    },
    columns: { id: true }
  })
  return Boolean(subject)
}

// One lesson per tutor and time slot, whatever subjects the tutor teaches.
async function lessonExists(tutorId: string, startAt: Date, generatedForWeek: Date) {
  const existing = await db.query.lessons.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
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
  const mondayKey = getMondayKey(useToday)
  const targetMonday = schoolTime(mondayKey)
  const minLessonDay = useToday
    ? addDays(schoolDayKey(new Date()), 1)
    : null

  process.stdout.write(`Generating lessons for week starting ${mondayKey}\n`)
  if (minLessonDay) {
    process.stdout.write(`Limiting to lessons from ${minLessonDay} through end of week\n`)
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
    if (availableWeekdays.length === 0) {
      continue
    }

    // A tutor without subjects has nothing a student could book.
    if (!(await tutorHasSubjects(tutor.id))) {
      continue
    }

    for (const availability of availableWeekdays) {
      if (!availability.startTime) {
        continue
      }

      const lessonDay = addDays(mondayKey, availability.weekday - 1)
      if (minLessonDay && lessonDay < minLessonDay) {
        continue
      }
      if (closureDateSet.has(lessonDay)) {
        continue
      }
      const startTimes = availability.startTime === '14:00-16:00'
        ? ['14:00', '15:00']
        : [availability.startTime]

      for (const startTime of startTimes) {
        const startAt = slotStart(lessonDay, startTime)
        if (await lessonExists(tutor.id, startAt, targetMonday)) {
          totalSkipped += 1
          continue
        }

        // The subject stays open: the first booking picks one of the tutor's subjects.
        await db.insert(lessons).values({
          tutorId: tutor.id,
          subjectId: null,
          subjectFromBooking: true,
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
      const generatedPush = lessonsGeneratedPush({ count: createdForTutor, weekStart: targetMonday })
      // Only lessons created by this run reach here, so a rerun adds no second entry.
      await recordNotifications([tutor.id], 'lessons', generatedPush)
      pushBatch.send(tutor.id, 'lessons', generatedPush)
    }
  }

  const studentsNotified = await notifyStudentsOfNewLessons(pushBatch, targetMonday, teachingYears)
  // Only the scheduled run for next week: a --today rerun or mock data proves nothing.
  if (!useToday && !mockOnly && await notifyIfWeekEmpty({ mail: mailBatch, push: pushBatch }, targetMonday, closureDateSet)) {
    process.stdout.write('No lessons in the week: admins warned\n')
  }
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
