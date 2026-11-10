// Purpose: Everything the year report needs, read in one pass. The report is the archive of
// the school year before the reset deletes students and tutors, so it is complete.
import { eq, isNull, sql } from 'drizzle-orm'

import type { NotificationStats } from '@/lib/notification-stats'

import db from '@/db'
import { analyticsDaily } from '@/db/schemas/analytics-daily.schema'
import { classSections } from '@/db/schemas/class-sections.schema'
import { lessonBookings } from '@/db/schemas/lesson-bookings.schema'
import { lessonFeedback, lessonFeedbackVersions } from '@/db/schemas/lesson-feedback.schema'
import { lessons } from '@/db/schemas/lessons.schema'
import { links } from '@/db/schemas/links.schema'
import { pushSubscriptions } from '@/db/schemas/push-subscriptions.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { subjectRequests } from '@/db/schemas/subject-requests.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import { LESSON_HAS_BOOKING_SQL } from '@/lib/lesson-state'
import { readNotificationStats } from '@/lib/notification-stats'

export interface ReportPerson {
  id: string
  role: string
  firstName: string
  lastName: string
  email: string
  section: string | null
  year: number | null
  isActive: boolean
  emailVerified: boolean
  createdAt: Date
  hasPush: boolean
}

export interface ReportData {
  people: ReportPerson[]
  subjects: Array<{ id: string, name: string }>
  tutorSubjects: Array<{ tutorId: string, subjectId: string }>
  tutorCapacity: Map<string, number>
  lessons: Array<{ id: string, tutorId: string, subjectId: string | null, startAt: Date, durationMinutes: number, seats: number, status: string, countsForTutor: boolean, generatedByJob: boolean }>
  bookings: Array<{ id: string, lessonId: string, studentId: string, subjectId: string, topic: string, status: string, countsForStudent: boolean, presence: boolean | null, createdAt: Date, canceledAt: Date | null }>
  feedback: Array<{ id: string, lessonId: string, authorUserId: string, targetUserId: string, authorRole: string, rating: number, text: string | null, createdAt: Date }>
  // Every version of the feedback that was edited or deleted, oldest first, deleted ones included.
  feedbackVersions: Array<{ feedbackId: string, lessonId: string, authorUserId: string, targetUserId: string, authorRole: string, deletedAt: Date | null, deletedByUserId: string | null, rating: number, text: string | null, editorUserId: string | null, editorRole: string, createdAt: Date }>
  tokenBalances: Map<string, number>
  subjectRequests: Array<{ studentId: string, subjectId: string, createdAt: Date }>
  analytics: Array<{ day: string, event: string, detail: string, role: string, year: number, count: number }>
  links: Array<{ id: string, slug: string, url: string, active: boolean, clicks: number }>
  notifications: NotificationStats
}

export async function loadReportData(): Promise<ReportData> {
  const hasPush = sql<boolean>`exists (select 1 from ${pushSubscriptions} where ${pushSubscriptions.userId} = ${users.id})`
  const [people, subjectRows, tutorSubjectRows, capacityRows, lessonRows, bookingRows, feedbackRows, versionRows, balanceRows, requestRows, analyticsRows, linkRows, notificationStats] = await Promise.all([
    db.select({
      id: users.id,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      studentYear: studentProfiles.year,
      studentActive: studentProfiles.isActive,
      tutorYear: tutorProfiles.year,
      tutorActive: tutorProfiles.isActive,
      section: classSections.name,
      hasPush
    })
      .from(users)
      .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .leftJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
      .leftJoin(classSections, sql`${classSections.id} = coalesce(${studentProfiles.sectionId}, ${tutorProfiles.sectionId})`),
    db.select({ id: subjects.id, name: subjects.name }).from(subjects),
    db.select({ tutorId: tutorSubjects.tutorId, subjectId: tutorSubjects.subjectId }).from(tutorSubjects),
    db.select({ tutorId: tutorSettings.tutorId, dailyCapacity: tutorSettings.dailyCapacity }).from(tutorSettings),
    db.select({
      id: lessons.id,
      tutorId: lessons.tutorId,
      subjectId: lessons.subjectId,
      startAt: lessons.startAt,
      durationMinutes: lessons.durationMinutes,
      seats: lessons.seats,
      status: lessons.status,
      countsForTutor: lessons.countsForTutor,
      generatedByJob: lessons.generatedByJob
    }).from(lessons).where(LESSON_HAS_BOOKING_SQL).orderBy(lessons.startAt),
    db.select({
      id: lessonBookings.id,
      lessonId: lessonBookings.lessonId,
      studentId: lessonBookings.studentId,
      subjectId: lessonBookings.subjectId,
      topic: lessonBookings.topic,
      status: lessonBookings.status,
      countsForStudent: lessonBookings.countsForStudent,
      presence: lessonBookings.studentPresence,
      createdAt: lessonBookings.createdAt,
      canceledAt: lessonBookings.canceledAt
    }).from(lessonBookings),
    db.select({
      id: lessonFeedback.id,
      lessonId: lessonFeedback.lessonId,
      authorUserId: lessonFeedback.authorUserId,
      targetUserId: lessonFeedback.targetUserId,
      authorRole: lessonFeedback.authorRole,
      rating: lessonFeedback.rating,
      text: lessonFeedback.text,
      createdAt: lessonFeedback.createdAt
    }).from(lessonFeedback).where(isNull(lessonFeedback.deletedAt)).orderBy(lessonFeedback.createdAt),
    db.select({
      feedbackId: lessonFeedbackVersions.feedbackId,
      lessonId: lessonFeedback.lessonId,
      authorUserId: lessonFeedback.authorUserId,
      targetUserId: lessonFeedback.targetUserId,
      authorRole: lessonFeedback.authorRole,
      deletedAt: lessonFeedback.deletedAt,
      deletedByUserId: lessonFeedback.deletedByUserId,
      rating: lessonFeedbackVersions.rating,
      text: lessonFeedbackVersions.text,
      editorUserId: lessonFeedbackVersions.editorUserId,
      editorRole: lessonFeedbackVersions.editorRole,
      createdAt: lessonFeedbackVersions.createdAt
    })
      .from(lessonFeedbackVersions)
      .innerJoin(lessonFeedback, eq(lessonFeedback.id, lessonFeedbackVersions.feedbackId))
      .where(sql`${lessonFeedback.deletedAt} is not null or (select count(*) from ${lessonFeedbackVersions} v where v.feedback_id = ${lessonFeedback.id}) > 1`)
      .orderBy(lessonFeedback.createdAt, lessonFeedbackVersions.feedbackId, lessonFeedbackVersions.createdAt),
    db.select({ studentId: tokenLedger.studentId, balance: sql<number>`sum(${tokenLedger.delta})::int` })
      .from(tokenLedger)
      .groupBy(tokenLedger.studentId),
    db.select({ studentId: subjectRequests.studentId, subjectId: subjectRequests.subjectId, createdAt: subjectRequests.createdAt }).from(subjectRequests),
    db.select().from(analyticsDaily).orderBy(analyticsDaily.day),
    db.select({ id: links.id, slug: links.slug, url: links.url, active: links.active, clicks: links.clicks }).from(links).orderBy(links.slug),
    readNotificationStats()
  ])

  return {
    people: people.map(person => ({
      id: person.id,
      role: person.role,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      section: person.section,
      year: person.studentYear ?? person.tutorYear ?? null,
      isActive: person.role === 'student' ? person.studentActive === true : person.role === 'tutor' ? person.tutorActive === true : true,
      emailVerified: person.emailVerifiedAt !== null,
      createdAt: person.createdAt,
      hasPush: Boolean(person.hasPush)
    })),
    subjects: subjectRows,
    tutorSubjects: tutorSubjectRows,
    tutorCapacity: new Map(capacityRows.map(row => [row.tutorId, row.dailyCapacity])),
    lessons: lessonRows.map(row => ({ ...row, generatedByJob: row.generatedByJob === true })),
    bookings: bookingRows,
    feedback: feedbackRows,
    feedbackVersions: versionRows,
    tokenBalances: new Map(balanceRows.map(row => [row.studentId, Number(row.balance)])),
    subjectRequests: requestRows,
    analytics: analyticsRows,
    links: linkRows,
    notifications: notificationStats
  }
}
