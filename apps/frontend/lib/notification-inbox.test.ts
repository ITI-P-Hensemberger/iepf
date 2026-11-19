import { describe, expect, it } from 'vitest'

import { badgeLabel, formatNotificationTime, safeNotificationPath } from './notification-inbox'
import { schoolTime } from './school-time'

describe('formatNotificationTime', () => {
  const now = schoolTime('2026-11-12', 15, 0)

  it('says how long ago within the day', () => {
    expect(formatNotificationTime(new Date(schoolTime('2026-11-12', 14, 59).getTime() + 40000).toISOString(), now)).toBe('Adesso')
    expect(formatNotificationTime(schoolTime('2026-11-12', 14, 55).toISOString(), now)).toBe('5 minuti fa')
    expect(formatNotificationTime(schoolTime('2026-11-12', 13, 0).toISOString(), now)).toBe('2 ore fa')
  })

  it('names yesterday and the days of the last week', () => {
    expect(formatNotificationTime(schoolTime('2026-11-11', 18, 0).toISOString(), now)).toBe('Ieri, 18:00')
    expect(formatNotificationTime(schoolTime('2026-11-07', 9, 0).toISOString(), now)).toBe('Sabato, 09:00')
  })

  it('falls back to the date, with the year only when it differs', () => {
    expect(formatNotificationTime(schoolTime('2026-11-02', 9, 0).toISOString(), now)).toBe('2 novembre')
    expect(formatNotificationTime(schoolTime('2025-12-20', 9, 0).toISOString(), now)).toBe('20 dicembre 2025')
  })
})

describe('safeNotificationPath', () => {
  it('keeps site paths and drops anything else', () => {
    expect(safeNotificationPath('/student/lessons')).toBe('/student/lessons')
    expect(safeNotificationPath('//evil.test/x')).toBe('/')
    expect(safeNotificationPath('https://evil.test')).toBe('/')
  })
})

describe('badgeLabel', () => {
  it('caps the counter at 9+', () => {
    expect(badgeLabel(3)).toBe('3')
    expect(badgeLabel(12)).toBe('9+')
  })
})
