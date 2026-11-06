// Purpose: Check that only data past its retention period is deleted.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import db, { closeDb } from '@/db'
import { adminInviteTokens } from '@/db/schemas/admin-invite-tokens.schema'
import { auditLogs } from '@/db/schemas/audit-logs.schema'
import { emailVerificationTokens } from '@/db/schemas/email-verification-tokens.schema'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { passwordResetTokens } from '@/db/schemas/password-reset-tokens.schema'
import { refreshTokens } from '@/db/schemas/refresh-tokens.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tutorInviteTokens } from '@/db/schemas/tutor-invite-tokens.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { AUDIT_LOG_RETENTION_DAYS, cleanUpExpiredData, deleteUnbookedLessons } from '@/lib/data-retention'
import { cleanDatabase } from '@/lib/db-cleanup'
import { assertLocalDatabase } from '@/lib/local-database'
import { schoolTime } from '@/lib/school-time'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-06-15T12:00:00Z')
const ago = (days: number) => new Date(now.getTime() - days * DAY)

let userId: string

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  const [user] = await db.insert(users).values({
    email: 'retention@example.test',
    firstName: 'Retention',
    lastName: 'Test',
    passwordHash: 'x',
    role: 'student'
  }).returning({ id: users.id })
  userId = user.id
})

afterAll(async () => {
  await closeDb()
})

function auditRow(path: string, createdAt: Date) {
  return { action: `GET ${path}`, method: 'GET', path, status: 200, durationMs: 1, createdAt }
}

describe('cleanUpExpiredData', () => {
  it('deletes only audit logs past the retention period', async () => {
    await db.insert(auditLogs).values([
      auditRow('/old', ago(AUDIT_LOG_RETENTION_DAYS + 1)),
      auditRow('/recent', ago(AUDIT_LOG_RETENTION_DAYS - 1))
    ])
    const deleted = await cleanUpExpiredData(now)
    expect(deleted.auditLogs).toBe(1)
    const rows = await db.select({ path: auditLogs.path }).from(auditLogs)
    expect(rows).toEqual([{ path: '/recent' }])
  })

  it('deletes only expired tokens of every kind', async () => {
    const expiry = (days: number) => new Date(now.getTime() + days * DAY)
    for (const [tag, expiresAt] of [['gone', expiry(-1)], ['kept', expiry(1)]] as const) {
      await db.insert(refreshTokens).values({ userId, tokenHash: `r-${tag}`, expiresAt })
      await db.insert(emailVerificationTokens).values({ userId, tokenHash: `e-${tag}`, expiresAt })
      await db.insert(passwordResetTokens).values({ userId, tokenHash: `p-${tag}`, expiresAt })
      await db.insert(adminInviteTokens).values({ email: `${tag}@example.test`, tokenHash: `a-${tag}`, expiresAt })
      await db.insert(tutorInviteTokens).values({ email: `${tag}@example.test`, tokenHash: `t-${tag}`, expiresAt })
    }

    expect(await cleanUpExpiredData(now)).toEqual({
      analyticsActiveUserRows: 0,
      analytics: 0,
      auditLogs: 0,
      refreshTokens: 1,
      emailVerificationTokens: 1,
      passwordResetTokens: 1,
      adminInviteTokens: 1,
      tutorInviteTokens: 1,
      pushSubscriptions: 0,
      announcementDismissals: 0,
      notifications: 0,
      unbookedLessons: 0
    })
    expect(await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, 'r-kept'))).toHaveLength(1)
    expect(await db.select().from(tutorInviteTokens).where(eq(tutorInviteTokens.tokenHash, 't-kept'))).toHaveLength(1)
  })

  it('works through more rows than one batch', async () => {
    await db.insert(auditLogs).values(Array.from({ length: 5_001 }, () => auditRow('/bulk', ago(100))))
    expect((await cleanUpExpiredData(now)).auditLogs).toBe(5_001)
  })
})

describe('deleteUnbookedLessons', () => {
  it('deletes lessons nobody ever booked once their bookings have closed', async () => {
    const [tutor] = await db.insert(users).values({
      email: 'retention-tutor@example.test',
      firstName: 'Retention',
      lastName: 'Tutor',
      passwordHash: 'x',
      role: 'tutor'
    }).returning({ id: users.id })
    const [subject] = await db.insert(subjects).values({ name: 'Retention', canonicalName: 'retention' }).returning({ id: subjects.id })
    const lesson = async (day: string, status = 'scheduled') => {
      const [row] = await db.insert(lessons).values({
        tutorId: tutor.id,
        subjectId: null,
        subjectFromBooking: true,
        startAt: schoolTime(day, 14),
        durationMinutes: 60,
        seats: 2,
        status
      }).returning({ id: lessons.id })
      return row.id
    }
    // 2026-06-15T12:00Z is 14:00 in Rome: today's bookings closed yesterday at 20:00.
    await lesson('2026-06-15')
    await lesson('2026-06-14', 'canceled')
    const todayCanceledBooking = await lesson('2026-06-15')
    const todayBooked = await lesson('2026-06-15', 'confirmed')
    const tomorrowOpen = await lesson('2026-06-16')
    await db.insert(lessonBookings).values([
      { lessonId: todayCanceledBooking, studentId: userId, subjectId: subject.id, topic: 'Annullata', status: 'canceled' },
      { lessonId: todayBooked, studentId: userId, subjectId: subject.id, topic: 'Confermata', status: 'confirmed' }
    ])
    const remaining = async () => new Set((await db.select({ id: lessons.id }).from(lessons)).map(row => row.id))

    expect(await deleteUnbookedLessons(now)).toBe(2)
    expect(await remaining()).toEqual(new Set([todayCanceledBooking, todayBooked, tomorrowOpen]))

    // At 20:30 in Rome tomorrow's bookings have closed too.
    expect(await deleteUnbookedLessons(new Date('2026-06-15T18:30:00Z'))).toBe(1)
    expect(await remaining()).toEqual(new Set([todayCanceledBooking, todayBooked]))
  })
})
