import { describe, expect, it } from 'vitest'

import { announcementStatus } from './announcement-status'

const now = new Date('2026-11-06T12:00:00Z')

describe('announcementStatus', () => {
  it('follows the switch first, then the time window', () => {
    expect(announcementStatus({ active: false, startsAt: null, expiresAt: null }, now)).toBe('disabled')
    expect(announcementStatus({ active: true, startsAt: null, expiresAt: null }, now)).toBe('active')
    expect(announcementStatus({ active: true, startsAt: '2026-11-07T00:00:00Z', expiresAt: null }, now)).toBe('scheduled')
    expect(announcementStatus({ active: true, startsAt: null, expiresAt: '2026-11-06T12:00:00Z' }, now)).toBe('expired')
  })
})
