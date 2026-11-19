import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  calendarKeyOf,
  combineDayAndTime,
  endOfSchoolDayIso,
  parseDayParam,
  schoolDayKey,
  schoolFormat,
  schoolHour,
  schoolTime,
  schoolToday,
  schoolWeekday,
  startOfSchoolDayIso
} from './school-time'
import { currentLessonMonday, dayRange, thisWeekBookable } from './school-week'

// Rome is UTC+1 in November and UTC+2 in summer.
describe.each(['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Europe/Rome'])('school time seen from %s', (timeZone) => {
  let previous: string | undefined
  beforeEach(() => {
    previous = process.env.TZ
    process.env.TZ = timeZone
  })
  afterEach(() => {
    process.env.TZ = previous
  })

  it('turns a Rome day and time into the instant', () => {
    expect(schoolTime('2026-11-23', 14).toISOString()).toBe('2026-11-23T13:00:00.000Z')
    expect(schoolTime('2026-07-01', 14, 30).toISOString()).toBe('2026-07-01T12:30:00.000Z')
    // The night clocks go back: midnight is still on the summer offset.
    expect(schoolTime('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z')
  })

  it('reads an instant on Rome\'s clock', () => {
    const lateSunday = new Date('2026-11-22T23:30:00Z')
    expect(schoolDayKey(lateSunday)).toBe('2026-11-23')
    expect(schoolWeekday(lateSunday)).toBe(1)
    expect(schoolHour(lateSunday)).toBe(0)
    expect(schoolFormat({ weekday: 'long', day: 'numeric', month: 'long' }).format(schoolTime('2026-11-23', 14)))
      .toBe('lunedì 23 novembre')
    expect(schoolFormat({ hour: '2-digit', minute: '2-digit' }).format(schoolTime('2026-11-23', 14))).toBe('14:00')
  })

  it('turns a picked day into the Rome day it names', () => {
    const picked = new Date(2026, 10, 23)
    expect(calendarKeyOf(picked)).toBe('2026-11-23')
    expect(startOfSchoolDayIso(picked)).toBe('2026-11-22T23:00:00.000Z')
    expect(endOfSchoolDayIso(picked)).toBe('2026-11-23T22:59:59.999Z')
    expect(combineDayAndTime(picked, '15:00').toISOString()).toBe('2026-11-23T14:00:00.000Z')
    expect(calendarKeyOf(parseDayParam('2026-11-22T23:00:00.000Z')!)).toBe('2026-11-23')
    expect(calendarKeyOf(schoolToday(new Date('2026-11-22T23:30:00Z')))).toBe('2026-11-23')
  })

  it('keeps the week rules on Rome\'s clock', () => {
    expect(dayRange('2026-11-23')).toEqual({ from: '2026-11-22T23:00:00.000Z', to: '2026-11-23T22:59:59.999Z' })
    expect(thisWeekBookable(schoolTime('2026-11-26', 19, 59))).toBe(true)
    expect(thisWeekBookable(schoolTime('2026-11-26', 20))).toBe(false)
    expect(currentLessonMonday(schoolTime('2026-11-28', 11, 59))).toBe('2026-11-23')
    expect(currentLessonMonday(schoolTime('2026-11-28', 12))).toBe('2026-11-30')
  })
})
