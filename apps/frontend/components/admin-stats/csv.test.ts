import { describe, expect, it } from 'vitest'

import { csvFilename, normalizePaged, toCsv } from './csv'

describe('stats csv', () => {
  it('quotes every value and escapes quotes', () => {
    expect(toCsv(['a', 'b'] as const, [{ a: 'x "y"', b: null }, { a: 1, b: true }])).toBe('"a","b"\n"x ""y""",""\n"1","true"')
  })

  it('reads the paged shapes the backend answers with', () => {
    expect(normalizePaged([1, 2])).toEqual({ items: [1, 2], total: 2 })
    expect(normalizePaged({ data: [1], total: 9 })).toEqual({ items: [1], total: 9 })
    expect(normalizePaged({ items: [1, 2, 3] })).toEqual({ items: [1, 2, 3], total: 3 })
    expect(normalizePaged(null)).toEqual({ items: [], total: 0 })
  })

  it('names files with a timestamp safe on every system', () => {
    expect(csvFilename('students', new Date('2026-11-06T10:20:30.123Z'))).toBe('iepf-students-2026-11-06T10-20-30.csv')
  })
})
