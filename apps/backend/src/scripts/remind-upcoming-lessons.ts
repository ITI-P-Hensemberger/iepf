// Purpose: Send reminder emails for confirmed lessons scheduled for tomorrow.
import { and, eq, gte, inArray, lte } from 'drizzle-orm'

import db from '@/db'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { buildLessonReminderStudentMessage, buildLessonReminderTutorMessage } from '@/lib/email-templates'
import { sendMail } from '@/lib/mailer'

function buildClassLabel(sectionName: string | null, sectionId: string | null, year: number | null) {
  const sectionLabel = sectionName ?? sectionId
  const yearLabel = year ? `anno ${year}` : null
  if (sectionLabel && yearLabel) {
    return `${sectionLabel} - ${yearLabel}`
  }
  return sectionLabel ?? yearLabel ?? null
}

async function main() {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() + 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)

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
      lte(lessons.startAt, end)
    ))

  if (lessonsRows.length === 0) {
    console.warn('No confirmed lessons found for tomorrow.')
    return
  }

  const lessonIds = lessonsRows.map(lesson => lesson.id)
  const bookings = await db
    .select({
      lessonId: lessonBookings.lessonId,
      studentId: lessonBookings.studentId
    })
    .from(lessonBookings)
    .where(and(
      inArray(lessonBookings.lessonId, lessonIds),
      eq(lessonBookings.status, 'confirmed')
    ))

  if (bookings.length === 0) {
    console.warn('No confirmed bookings found for tomorrow.')
    return
  }

  const tutorIds = Array.from(new Set(lessonsRows.map(lesson => lesson.tutorId)))
  const subjectIds = Array.from(new Set(lessonsRows.map(lesson => lesson.subjectId)))
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

  for (const booking of bookings) {
    const lesson = lessonMap.get(booking.lessonId)
    const student = studentMap.get(booking.studentId)
    if (!lesson || !student?.email) {
      continue
    }
    const tutor = tutorMap.get(lesson.tutorId)
    const subjectName = subjectMap.get(lesson.subjectId)
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
      studentClass: classLabel
    })

    void sendMail({
      to: student.email,
      subject: studentMessage.subject,
      text: studentMessage.text,
      html: studentMessage.html
    }).catch(err => console.error('Failed to send student reminder email:', err))
  }

  const tutorLessonMap = new Map<string, Map<string, { startAt: Date, subjectName: string, students: Array<{ name: string, classLabel: string | null }> }>>()

  for (const booking of bookings) {
    const lesson = lessonMap.get(booking.lessonId)
    const student = studentMap.get(booking.studentId)
    if (!lesson || !student) {
      continue
    }
    const subjectName = subjectMap.get(lesson.subjectId)
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
        students: []
      })
    }
    lessonMapForTutor.get(lesson.id)!.students.push({
      name: `${student.firstName} ${student.lastName}`,
      classLabel
    })
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
      lessons: lessonsForTutor
    })

    void sendMail({
      to: tutor.email,
      subject: tutorMessage.subject,
      text: tutorMessage.text,
      html: tutorMessage.html
    }).catch(err => console.error('Failed to send tutor reminder email:', err))
  }

  console.warn(`Sent reminders for ${bookings.length} booking(s).`)
}

main()
  .catch((error) => {
    console.error('Failed to send lesson reminders:', error)
    process.exitCode = 1
  })
