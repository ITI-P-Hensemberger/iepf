// Purpose: After the weekly generation, tell students they can book the new lessons.
import { and, eq } from 'drizzle-orm'

import type { PushBatch } from '@/lib/reminder-delivery'

import db from '@/db'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { lessonsAvailablePush } from '@/lib/push-messages'
import { sendReminderPushOnce } from '@/lib/reminder-delivery'
import { schoolDayKey } from '@/lib/school-time'
import { tutorCanTeachStudent } from '@/lib/school-years'

// Only students who can book at least one of the new lessons: those of a tutor in a
// higher year. A rerun of the same week sends nothing new, even if it adds lessons.
export async function notifyStudentsOfNewLessons(batch: PushBatch, weekStart: Date, tutorYears: number[]) {
  if (tutorYears.length === 0) {
    return 0
  }
  const highestYear = Math.max(...tutorYears)
  const students = await db.select({ id: users.id, year: studentProfiles.year })
    .from(users)
    .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(and(eq(users.role, 'student'), eq(studentProfiles.isActive, true)))

  const message = lessonsAvailablePush(weekStart)
  let notified = 0
  for (const student of students) {
    if (!tutorCanTeachStudent(highestYear, student.year)) {
      continue
    }
    if (await sendReminderPushOnce(batch, `lessons-available:${schoolDayKey(weekStart)}:${student.id}`, student.id, 'lessons', message)) {
      notified += 1
    }
  }
  return notified
}
