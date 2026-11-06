// Purpose: School days and times are read in Europe/Rome, whatever time zone the process runs in.
import { describe, expect, it } from 'vitest'

import { addDays, bookingCutoff, schoolDayKey, schoolDayRange, schoolTime, weekdayOf } from '@/lib/school-time'

describe('school time', () => {
  it('names the day in Rome, not in UTC', () => {
    // 23:30 UTC is already the next day in Rome.
    expect(schoolDayKey(new Date('2026-01-05T23:30:00Z'))).toBe('2026-01-06')
    expect(schoolDayKey(new Date('2026-07-05T21:59:00Z'))).toBe('2026-07-05')
    expect(schoolDayKey(new Date('2026-07-05T22:00:00Z'))).toBe('2026-07-06')
  })

  it('places wall-clock times in winter and summer time', () => {
    expect(schoolTime('2026-01-05', 14).toISOString()).toBe('2026-01-05T13:00:00.000Z')
    expect(schoolTime('2026-07-06', 14, 30).toISOString()).toBe('2026-07-06T12:30:00.000Z')
  })

  it('spans a day of 23 hours when clocks go forward', () => {
    const { start, end } = schoolDayRange(new Date('2026-03-29T12:00:00Z'))
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z')
    expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z')
  })

  it('counts days and weekdays on the calendar', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(weekdayOf('2026-11-09')).toBe(1)
    expect(weekdayOf('2026-11-08')).toBe(7)
  })

  it('closes bookings at 20:00 in Rome the day before the lesson', () => {
    expect(bookingCutoff(new Date('2026-11-10T13:00:00Z')).toISOString()).toBe('2026-11-09T19:00:00.000Z')
    // A lesson early on a Monday closes on Sunday evening.
    expect(bookingCutoff(new Date('2026-11-08T23:30:00Z')).toISOString()).toBe('2026-11-08T19:00:00.000Z')
  })
})
