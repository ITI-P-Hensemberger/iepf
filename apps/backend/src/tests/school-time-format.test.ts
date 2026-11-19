// Purpose: Emails and pushes show school time in Rome, whatever time zone the process runs in
// (CI runs in UTC; production sets TZ=Europe/Rome).
/* eslint-disable node/no-process-env */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildAvailabilityReminderMessage, buildEmptyWeekAdminMessage, buildLessonCreatedMessage, buildLessonsGeneratedMessage } from '@/lib/email-templates'
import { availabilityReminderPush, emptyWeekPush, lessonCreatedPush, lessonsAvailablePush, lessonsGeneratedPush } from '@/lib/push-messages'
import { schoolTime } from '@/lib/school-time'

// Monday 23 November 2026: midnight in Rome is still Sunday in UTC and New York.
const monday = schoolTime('2026-11-23')
const lesson = schoolTime('2026-11-23', 14)

describe.each(['UTC', 'America/New_York', 'Asia/Tokyo'])('school time in %s', (timeZone) => {
  let previous: string | undefined
  beforeEach(() => {
    previous = process.env.TZ
    process.env.TZ = timeZone
  })
  afterEach(() => {
    process.env.TZ = previous
  })

  it('formats a lesson at 14:00 on Monday 23', () => {
    expect(lessonCreatedPush({ lessonId: 'l', subjectName: 'Matematica', startAt: lesson }).body)
      .toContain('Lunedì 23 novembre alle ore 14:00')
    expect(buildLessonCreatedMessage({
      lessonId: 'l',
      lessonStartAt: lesson,
      subjectName: 'Matematica',
      tutorName: 'T'
    }).text)
      .toContain('23 novembre 2026')
  })

  it('formats the week starting on Monday 23', () => {
    for (const body of [
      availabilityReminderPush(monday).body,
      emptyWeekPush(monday).body,
      lessonsAvailablePush(monday).body,
      lessonsGeneratedPush({ count: 2, weekStart: monday }).body
    ]) {
      expect(body).toContain('23 novembre')
    }
    for (const message of [
      buildAvailabilityReminderMessage(monday),
      buildLessonsGeneratedMessage({ tutorName: 'T', count: 2, weekStart: monday }),
      buildEmptyWeekAdminMessage(monday)
    ]) {
      expect(message.text).toContain('23 novembre')
    }
  })
})
