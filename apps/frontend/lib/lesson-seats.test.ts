import { describe, expect, it } from 'vitest'

import { lessonBookableSeats } from '@/lib/lesson-seats'

describe('lessonBookableSeats', () => {
  it('offers all seats on an empty lesson', () => {
    expect(lessonBookableSeats({ availableSeats: 3, dailyCapacity: 3, dailyOccupancy: 0 })).toBe(3)
  })

  it('counts a booking on the same lesson once', () => {
    expect(lessonBookableSeats({ availableSeats: 1, dailyCapacity: 2, dailyOccupancy: 1 })).toBe(1)
  })

  it('applies daily capacity used by other lessons', () => {
    expect(lessonBookableSeats({ availableSeats: 3, dailyCapacity: 3, dailyOccupancy: 2 })).toBe(1)
  })

  it('never goes below zero', () => {
    expect(lessonBookableSeats({ availableSeats: 2, dailyCapacity: 1, dailyOccupancy: 4 })).toBe(0)
  })
})
