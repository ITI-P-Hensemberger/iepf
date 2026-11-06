import { describe, expect, it } from 'vitest'

import { canMarkPresence, daySummary, subjectLabel, type ScheduleLesson } from './lesson-schedule'
import { OPEN_SUBJECT_LABEL } from './lesson-subject'

function lesson(values: Partial<ScheduleLesson>): ScheduleLesson {
  return {
    id: 'l',
    tutorId: 't',
    tutorName: 'Tutor',
    tutorYear: 5,
    tutorDailyCapacity: 2,
    subjectId: null,
    subjectName: null,
    subjectFromBooking: true,
    subjectOptions: [],
    startAt: '2026-11-10T13:00:00.000Z',
    durationMinutes: 60,
    seats: 2,
    status: 'scheduled',
    bookingsOpen: true,
    bookings: [],
    ...values
  }
}

const booking = { id: 'b', studentId: 's', studentName: 'S', classLabel: null, subjectId: 'm', topic: 'x', studentPresence: null }

describe('lesson schedule', () => {
  it('names open lessons', () => {
    expect(subjectLabel(lesson({}))).toBe(OPEN_SUBJECT_LABEL)
    expect(subjectLabel(lesson({ subjectName: 'Fisica' }))).toBe('Fisica')
  })

  it('lets tutors mark presence only during the two hours from the start', () => {
    const item = lesson({})
    expect(canMarkPresence(item, new Date('2026-11-10T12:59:00Z'))).toBe(false)
    expect(canMarkPresence(item, new Date('2026-11-10T14:30:00Z'))).toBe(true)
    expect(canMarkPresence(item, new Date('2026-11-10T15:01:00Z'))).toBe(false)
    expect(canMarkPresence(lesson({ status: 'canceled' }), new Date('2026-11-10T13:30:00Z'))).toBe(false)
  })

  it('sums a day without canceled lessons and free seats of closed ones', () => {
    expect(daySummary([
      lesson({ subjectId: 'm', subjectName: 'M', bookings: [booking], tutorDailyCapacity: 5 }),
      lesson({ tutorDailyCapacity: 5 }),
      lesson({ bookingsOpen: false, tutorDailyCapacity: 5 }),
      lesson({ status: 'canceled', tutorDailyCapacity: 5 })
    ])).toEqual({ slots: 3, booked: 1, free: 3, open: 2 })
  })

  it('stops free seats at the tutor\'s daily capacity', () => {
    const full = { ...booking, id: 'b2' }
    expect(daySummary([
      lesson({ subjectId: 'm', subjectName: 'M', bookings: [booking, full] }),
      lesson({ id: 'open' }),
      lesson({ id: 'other', tutorId: 'u', tutorDailyCapacity: 3 })
    ]).free).toBe(2)
  })
})
