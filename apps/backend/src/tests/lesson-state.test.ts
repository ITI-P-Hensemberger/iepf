// Purpose: A lesson that took place stays 'confirmed': its state comes from the clock.
import { describe, expect, it } from 'vitest'

import { lessonState } from '@/lib/lesson-state'

const now = new Date('2026-03-10T15:30:00Z')
const at = (iso: string, status: string, durationMinutes = 60) => lessonState({ status, startAt: new Date(iso), durationMinutes }, now)

describe('lessonState', () => {
  it('reads done, upcoming and expired from the time', () => {
    expect(at('2026-03-10T14:00:00Z', 'confirmed')).toBe('done')
    // Started but not over yet.
    expect(at('2026-03-10T15:00:00Z', 'confirmed')).toBe('upcoming')
    expect(at('2026-03-11T14:00:00Z', 'scheduled')).toBe('upcoming')
    expect(at('2026-03-10T14:00:00Z', 'scheduled')).toBe('expired')
    expect(at('2026-03-09T14:00:00Z', 'canceled')).toBe('canceled')
  })
})
