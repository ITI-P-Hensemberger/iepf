import { describe, expect, it } from 'vitest'

import { addDaysToKey, dayKeyOf, mondayOf, schoolDays, thisWeekBookable, currentLessonMonday } from './school-week'
import { schoolTime } from './school-time'

describe('school week', () => {
  it('finds the Monday of any day of the week', () => {
    expect(mondayOf('2026-11-11')).toBe('2026-11-09')
    expect(mondayOf('2026-11-09')).toBe('2026-11-09')
    expect(mondayOf('2026-11-15')).toBe('2026-11-09')
  })

  it('lists Monday to Friday across a month end', () => {
    expect(schoolDays('2026-11-30')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'])
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('offers this week until Thursday at 20:00', () => {
    expect(thisWeekBookable(schoolTime('2026-11-09', 10))).toBe(true)
    expect(thisWeekBookable(schoolTime('2026-11-12', 19, 59))).toBe(true)
    expect(thisWeekBookable(schoolTime('2026-11-12', 20, 0))).toBe(false)
    expect(thisWeekBookable(schoolTime('2026-11-13', 10))).toBe(false)
    expect(thisWeekBookable(schoolTime('2026-11-14', 10))).toBe(false)
    expect(thisWeekBookable(schoolTime('2026-11-15', 10))).toBe(false)
    expect(dayKeyOf(schoolTime('2026-01-05', 23, 59))).toBe('2026-01-05')
  })
})

describe('the week a tutor is working on', () => {
  it('moves to the next week on Saturday at noon', () => {
    expect(currentLessonMonday(schoolTime('2026-11-06', 18, 0))).toBe('2026-11-02')
    expect(currentLessonMonday(schoolTime('2026-11-07', 11, 59))).toBe('2026-11-02')
    expect(currentLessonMonday(schoolTime('2026-11-07', 12, 0))).toBe('2026-11-09')
    expect(currentLessonMonday(schoolTime('2026-11-08', 9, 0))).toBe('2026-11-09')
    expect(currentLessonMonday(schoolTime('2026-11-09', 8, 0))).toBe('2026-11-09')
  })
})
