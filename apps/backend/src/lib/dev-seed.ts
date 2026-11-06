// Purpose: Small, repeatable local dataset. Never used by production jobs.
import db from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { classSections } from '@/db/schemas/class-sections.schema'
import { globalSettings } from '@/db/schemas/global-settings.schema'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { tutorWeekdayAvailability } from '@/db/schemas/tutor-weekday-availability.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { assertLocalDatabase } from '@/lib/local-database'
import { hashPassword } from '@/lib/password'

export const DEV_PASSWORD = 'LocalDemo123!'
export const DEV_ROLES = ['admin', 'activator', 'tutor', 'student'] as const

export async function seedDevelopmentData() {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  const passwordHash = await hashPassword(DEV_PASSWORD)
  return db.transaction(async (tx) => {
    const [section] = await tx.insert(classSections).values({ name: 'DEV' }).onConflictDoUpdate({ target: classSections.name, set: { name: 'DEV' } }).returning()
    const [subject] = await tx.insert(subjects).values({ name: 'Matematica demo', canonicalName: 'dev_math' }).onConflictDoUpdate({ target: subjects.canonicalName, set: { canonicalName: 'dev_math' } }).returning()
    const ids: Record<string, string> = {}
    for (const role of DEV_ROLES) {
      const email = `${role}@example.test`
      await tx.insert(users).values({ email, firstName: 'Demo', lastName: role, passwordHash, role, emailVerifiedAt: new Date() }).onConflictDoNothing({ target: users.email })
      const user = await tx.query.users.findFirst({ where: (fields, ops) => ops.eq(fields.email, email) })
      if (!user || user.role !== role) {
        throw new Error(`Demo email already belongs to another role: ${email}`)
      }
      ids[role] = user.id
    }
    await tx.insert(adminProfiles).values({ userId: ids.admin, isActive: true }).onConflictDoNothing()
    await tx.insert(studentProfiles).values({ userId: ids.student, sectionId: section.id, year: 2, isActive: true }).onConflictDoNothing()
    await tx.insert(tutorProfiles).values({ userId: ids.tutor, sectionId: section.id, year: 4, isActive: true }).onConflictDoNothing()
    await tx.insert(tutorSettings).values({ tutorId: ids.tutor, dailyCapacity: 2 }).onConflictDoNothing()
    await tx.insert(tutorSubjects).values({ tutorId: ids.tutor, subjectId: subject.id }).onConflictDoNothing()
    await tx.insert(tutorWeekdayAvailability).values([1, 3, 5].map(weekday => ({
      tutorId: ids.tutor,
      weekday,
      isAvailable: true,
      startTime: '14:00-16:00' as const
    }))).onConflictDoNothing()
    await tx.insert(tokenLedger).values({
      id: '00000000-0000-4000-8000-000000000101',
      studentId: ids.student,
      delta: 30,
      reason: 'initial_grant'
    }).onConflictDoNothing()
    const startAt = new Date()
    startAt.setDate(startAt.getDate() + 1)
    startAt.setHours(14, 0, 0, 0)
    const confirmedId = '00000000-0000-4000-8000-000000000102'
    await tx.insert(lessons).values([
      { id: confirmedId, tutorId: ids.tutor, subjectId: subject.id, startAt, durationMinutes: 60, seats: 2, status: 'confirmed' },
      // Open like a generated lesson: the first booking picks the subject.
      { id: '00000000-0000-4000-8000-000000000103', tutorId: ids.tutor, subjectId: null, subjectFromBooking: true, startAt: new Date(startAt.getTime() + 86400000), durationMinutes: 60, seats: 2, status: 'scheduled' }
    ]).onConflictDoNothing()
    await tx.insert(lessonBookings).values({
      id: '00000000-0000-4000-8000-000000000104',
      lessonId: confirmedId,
      studentId: ids.student,
      subjectId: subject.id,
      topic: 'Equazioni: esempio locale'
    }).onConflictDoNothing()
    await tx.insert(tokenLedger).values({
      id: '00000000-0000-4000-8000-000000000105',
      studentId: ids.student,
      lessonId: confirmedId,
      delta: -1,
      reason: 'lesson_booking'
    }).onConflictDoNothing()
    await tx.insert(globalSettings).values([
      { key: 'maintenance', value: { enabled: false, message: null, roles: ['student', 'tutor', 'admin', 'activator'] } },
      { key: 'serviceMessages', value: {} },
      { key: 'closureDates', value: [] }
    ]).onConflictDoNothing()
    return ids
  })
}
