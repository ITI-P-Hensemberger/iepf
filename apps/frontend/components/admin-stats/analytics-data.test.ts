import { describe, expect, it } from 'vitest'

import type { AnalyticsPayload } from './analytics-data'

import { activeByYear, averageDailyActive, bookingFunnel, dailyByRole, daysBetween, percent, pushByCategory } from './analytics-data'

const payload: AnalyticsPayload = {
  from: '2026-10-30',
  to: '2026-11-02',
  days: 4,
  daily: [
    { day: '2026-10-30', event: 'active_users', role: 'student', count: 10 },
    { day: '2026-10-31', event: 'active_users', role: 'student', count: 6 },
    { day: '2026-10-31', event: 'active_users', role: 'tutor', count: 2 },
    { day: '2026-10-31', event: 'page_view', role: 'student', count: 40 }
  ],
  byDetail: [
    { event: 'page_view', detail: '/student/book', count: 20 },
    { event: 'book_dialog_open', detail: '', count: 8 },
    { event: 'booking', detail: 'ok', count: 5 },
    { event: 'booking', detail: 'lesson_full', count: 2 },
    { event: 'push_sent', detail: 'reminders', count: 30 },
    { event: 'push_open', detail: 'reminders', count: 9 },
    { event: 'push_open', detail: 'bookings', count: 1 }
  ],
  byGroup: [
    { event: 'active_users', role: 'student', year: 2, count: 12 },
    { event: 'active_users', role: 'student', year: 1, count: 4 },
    { event: 'active_users', role: 'tutor', year: 4, count: 2 }
  ]
}

describe('analytics data', () => {
  it('lists every day of the range, across months', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })

  it('fills missing days with 0 for the roles that have data', () => {
    const { points, roles } = dailyByRole(payload, 'active_users')
    expect(roles).toEqual(['student', 'tutor'])
    expect(points).toEqual([
      { day: '2026-10-30', student: 10, tutor: 0 },
      { day: '2026-10-31', student: 6, tutor: 2 },
      { day: '2026-11-01', student: 0, tutor: 0 },
      { day: '2026-11-02', student: 0, tutor: 0 }
    ])
  })

  it('can leave out the days that were not counted yet', () => {
    const { points } = dailyByRole(payload, 'active_users', { onlyCountedDays: true })
    expect(points.map(point => point.day)).toEqual(['2026-10-30', '2026-10-31'])
  })

  it('builds the booking funnel and the reasons for failures', () => {
    const funnel = bookingFunnel(payload)
    expect(funnel.steps.map(step => step.count)).toEqual([20, 8, 5])
    expect(funnel.attempts).toBe(7)
    expect(funnel.failures).toEqual([{ reason: 'Posti esauriti', count: 2 }])
  })

  it('pairs push sent and opened per category', () => {
    expect(pushByCategory(payload)).toEqual([
      { category: 'Promemoria', sent: 30, opened: 9 },
      { category: 'Prenotazioni', sent: 0, opened: 1 }
    ])
  })

  it('averages active users over the days that were counted', () => {
    expect(averageDailyActive(payload)).toBe(9)
    expect(activeByYear(payload, 'student')).toEqual([
      { year: '1º anno', average: 2 },
      { year: '2º anno', average: 6 }
    ])
    expect(percent(1, 3)).toBe(33)
    expect(percent(1, 0)).toBeNull()
  })
})
