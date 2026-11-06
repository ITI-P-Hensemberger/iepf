// Purpose: Send reminder emails for confirmed lessons scheduled for today.
import { and, eq, gte, inArray, lt } from 'drizzle-orm'

import db, { closeDb } from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { buildLessonReminderStudentMessage, buildLessonReminderTutorMessage } from '@/lib/email-templates'
import { createMailBatch } from '@/lib/mail-batch'
import { closeMailer } from '@/lib/mailer'
import { studentReminderPush, tutorReminderPush } from '@/lib/push-messages'
import { createPushBatch, pruneReminderDeliveries, sendReminderOnce, sendReminderPushOnce } from '@/lib/reminder-delivery'
import { addDays, schoolDayKey, schoolTime } from '@/lib/school-time'

function buildClassLabel(sectionName: string | null, sectionId: string | null, year: number | null) {
  const sectionLabel = sectionName ?? sectionId
  const yearLabel = year ? `anno ${year}` : null
  if (sectionLabel && yearLabel) {
    return `${sectionLabel} - ${yearLabel}`
  }
  return sectionLabel ?? yearLabel ?? null
}

function parseTodayFlag() {
  const args = new Set(process.argv.slice(2))
  const hasToday = args.has('today') || args.has('--today')
  const hasTomorrow = args.has('tomorrow') || args.has('--tomorrow')

  if (hasToday && hasTomorrow) {
    throw new Error('Pass only one of --today or --tomorrow.')
  }
  if (!hasToday && !hasTomorrow) {
    throw new Error('Missing required flag: --today or --tomorrow.')
  }

  return hasToday
}

async function main() {
  const today = parseTodayFlag()
  const dayKey = addDays(schoolDayKey(new Date()), today ? 0 : 1)
  const start = schoolTime(dayKey)
  const end = schoolTime(addDays(dayKey, 1))

  const lessonsRows = await db
    .select({
      id: lessons.id,
      tutorId: lessons.tutorId,
      subjectId: lessons.subjectId,
      startAt: lessons.startAt
    })
    .from(lessons)
    .where(and(
      eq(lessons.status, 'confirmed'),
      gte(lessons.startAt, start),
      lt(lessons.startAt, end)
    ))

  if (lessonsRows.length === 0) {
    console.warn(`No confirmed lessons found for ${today ? 'today' : 'tomorrow'}.`)
    return
  }

  const lessonIds = lessonsRows.map(lesson => lesson.id)
  const bookings = await db
    .select({
      id: lessonBookings.id,
      lessonId: lessonBookings.lessonId,
      studentId: lessonBookings.studentId,
      subjectId: lessonBookings.subjectId,
      topic: lessonBookings.topic
    })
    .from(lessonBookings)
    .where(and(
      inArray(lessonBookings.lessonId, lessonIds),
      eq(lessonBookings.status, 'confirmed')
    ))

  if (bookings.length === 0) {
    console.warn(`No confirmed bookings found for ${today ? 'today' : 'tomorrow'}.`)
    return
  }

  const tutorIds = Array.from(new Set(lessonsRows.map(lesson => lesson.tutorId)))
  // Each booking carries its subject, the same one its confirmed lesson has.
  const subjectIds = Array.from(new Set(bookings.map(booking => booking.subjectId)))
  const studentIds = Array.from(new Set(bookings.map(booking => booking.studentId)))

  const [tutors, subjectsList, students, profiles] = await Promise.all([
    db.query.users.findMany({
      where(fields, operators) {
        return operators.inArray(fields.id, tutorIds)
      },
      columns: { id: true, firstName: true, lastName: true, email: true }
    }),
    db.query.subjects.findMany({
      where(fields, operators) {
        return operators.inArray(fields.id, subjectIds)
      },
      columns: { id: true, name: true }
    }),
    db.query.users.findMany({
      where(fields, operators) {
        return operators.inArray(fields.id, studentIds)
      },
      columns: { id: true, firstName: true, lastName: true, email: true }
    }),
    db.query.studentProfiles.findMany({
      where(fields, operators) {
        return operators.inArray(fields.userId, studentIds)
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

  const tutorMap = new Map(tutors.map(tutor => [tutor.id, tutor]))
  const subjectMap = new Map(subjectsList.map(subject => [subject.id, subject.name]))
  const studentMap = new Map(students.map(student => [student.id, student]))
  const profileMap = new Map(profiles.map(profile => [profile.userId, profile]))
  const sectionNameMap = new Map(sections.map(section => [section.id, section.name]))
  const lessonMap = new Map(lessonsRows.map(lesson => [lesson.id, lesson]))

  await pruneReminderDeliveries()
  const mailBatch = createMailBatch()
  const pushBatch = createPushBatch()
  // today and tomorrow are separate reminders for the same lesson, both wanted.
  const reminderPrefix = `lessons-${today ? 'today' : 'tomorrow'}:${dayKey}`
  let sent = 0

  for (const booking of bookings) {
    const lesson = lessonMap.get(booking.lessonId)
    const student = studentMap.get(booking.studentId)
    if (!lesson || !student?.email) {
      continue
    }
    const tutor = tutorMap.get(lesson.tutorId)
    const subjectName = subjectMap.get(booking.subjectId)
    const profile = profileMap.get(booking.studentId)
    const sectionName = profile?.sectionId ? sectionNameMap.get(profile.sectionId) ?? null : null
    const classLabel = buildClassLabel(sectionName, profile?.sectionId ?? null, profile?.year ?? null)

    if (!tutor || !subjectName) {
      continue
    }

    const studentMessage = buildLessonReminderStudentMessage({
      lessonStartAt: new Date(lesson.startAt),
      subjectName,
      tutorName: `${tutor.firstName} ${tutor.lastName}`,
      studentName: `${student.firstName} ${student.lastName}`,
      studentClass: classLabel,
      topic: booking.topic,
      today
    })

    if (await sendReminderOnce(mailBatch, `${reminderPrefix}:booking:${booking.id}`, {
      to: student.email,
      subject: studentMessage.subject,
      text: studentMessage.text,
      html: studentMessage.html
    })) {
      sent += 1
    }
    await sendReminderPushOnce(pushBatch, `${reminderPrefix}:booking:${booking.id}`, booking.studentId, 'reminders', studentReminderPush({
      lessonId: lesson.id,
      subjectName,
      startAt: new Date(lesson.startAt),
      today
    }))
  }

  const tutorLessonMap = new Map<string, Map<string, { startAt: Date, subjectName: string, students: Array<{ name: string, classLabel: string | null }>, topics: string[] }>>()

  for (const booking of bookings) {
    const lesson = lessonMap.get(booking.lessonId)
    const student = studentMap.get(booking.studentId)
    if (!lesson || !student) {
      continue
    }
    const subjectName = subjectMap.get(booking.subjectId)
    if (!subjectName) {
      continue
    }
    const profile = profileMap.get(booking.studentId)
    const sectionName = profile?.sectionId ? sectionNameMap.get(profile.sectionId) ?? null : null
    const classLabel = buildClassLabel(sectionName, profile?.sectionId ?? null, profile?.year ?? null)

    if (!tutorLessonMap.has(lesson.tutorId)) {
      tutorLessonMap.set(lesson.tutorId, new Map())
    }
    const lessonMapForTutor = tutorLessonMap.get(lesson.tutorId)!
    if (!lessonMapForTutor.has(lesson.id)) {
      lessonMapForTutor.set(lesson.id, {
        startAt: new Date(lesson.startAt),
        subjectName,
        students: [],
        topics: []
      })
    }
    lessonMapForTutor.get(lesson.id)!.students.push({
      name: `${student.firstName} ${student.lastName}`,
      classLabel
    })
    lessonMapForTutor.get(lesson.id)!.topics.push(booking.topic)
  }

  for (const [tutorId, lessonsById] of tutorLessonMap) {
    const tutor = tutorMap.get(tutorId)
    if (!tutor?.email) {
      continue
    }
    const lessonsForTutor = Array.from(lessonsById.values())
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())

    const tutorMessage = buildLessonReminderTutorMessage({
      tutorName: `${tutor.firstName} ${tutor.lastName}`,
      lessons: lessonsForTutor.map(lesson => ({
        ...lesson,
        topics: Array.from(new Set(lesson.topics.map(topic => topic.trim()).filter(Boolean)))
      })),
      today
    })

    if (await sendReminderOnce(mailBatch, `${reminderPrefix}:tutor:${tutorId}`, {
      to: tutor.email,
      subject: tutorMessage.subject,
      text: tutorMessage.text,
      html: tutorMessage.html
    })) {
      sent += 1
    }
    await sendReminderPushOnce(pushBatch, `${reminderPrefix}:tutor:${tutorId}`, tutorId, 'reminders', tutorReminderPush({
      startTimes: lessonsForTutor.map(lesson => lesson.startAt),
      today
    }))
  }

  // Pushes first: a failed email batch throws, and the pushes already claimed must still go.
  const pushed = await pushBatch.finish()
  await mailBatch.finish()
  console.warn(`Sent ${sent} reminder(s) for ${bookings.length} booking(s); ${pushed.delivered} push(es) delivered, ${pushed.failed} failed.`)
}

main()
  .catch((error) => {
    console.error('Failed to send lesson reminders:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    closeMailer()
    await closeDb()
  })
