import { describe, expect, it } from 'vitest'

import { badgeLabel, formatNotificationTime, safeNotificationPath } from './notification-inbox'

describe('formatNotificationTime', () => {
  const now = new Date(2026, 10, 12, 15, 0)

  it('says how long ago within the day', () => {
    expect(formatNotificationTime(new Date(2026, 10, 12, 14, 59, 40).toISOString(), now)).toBe('Adesso')
    expect(formatNotificationTime(new Date(2026, 10, 12, 14, 55).toISOString(), now)).toBe('5 minuti fa')
    expect(formatNotificationTime(new Date(2026, 10, 12, 13, 0).toISOString(), now)).toBe('2 ore fa')
  })

  it('names yesterday and the days of the last week', () => {
    expect(formatNotificationTime(new Date(2026, 10, 11, 18, 0).toISOString(), now)).toBe('Ieri, 18:00')
    expect(formatNotificationTime(new Date(2026, 10, 7, 9, 0).toISOString(), now)).toBe('Sabato, 09:00')
  })

  it('falls back to the date, with the year only when it differs', () => {
    expect(formatNotificationTime(new Date(2026, 10, 2, 9, 0).toISOString(), now)).toBe('2 novembre')
    expect(formatNotificationTime(new Date(2025, 11, 20, 9, 0).toISOString(), now)).toBe('20 dicembre 2025')
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
