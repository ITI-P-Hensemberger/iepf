import { describe, expect, it } from 'vitest'

import { classLabel } from './class-label'

describe('classLabel', () => {
  it('writes year and section together', () => {
    expect(classLabel(2, 'D2')).toBe('2D2')
    expect(classLabel(5, ' A ')).toBe('5A')
  })

  it('falls back to the part it has', () => {
    expect(classLabel(null, 'DEV')).toBe('DEV')
    expect(classLabel(3, null)).toBe('3ª')
    expect(classLabel(null, null)).toBeNull()
  })
})
