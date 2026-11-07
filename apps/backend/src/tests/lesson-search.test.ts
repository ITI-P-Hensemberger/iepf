// Purpose: Pin how typed dates turn into the text the lesson search compares.
import { describe, expect, it } from 'vitest'

import { normalizeDateQuery } from '@/lib/lesson-search'

describe('dates typed in a search', () => {
  it('reads day and month written with numbers', () => {
    expect(normalizeDateQuery('13/11')).toBe('13/11/')
    expect(normalizeDateQuery('13-11')).toBe('13/11/')
    expect(normalizeDateQuery('3.11.26')).toBe('03/11/2026')
    expect(normalizeDateQuery('13/11/2026')).toBe('13/11/2026')
  })

  it('reads Italian month names, whole or short', () => {
    expect(normalizeDateQuery('13 novembre')).toBe('13/11/')
    expect(normalizeDateQuery('13 nov')).toBe('13/11/')
    expect(normalizeDateQuery('13 Nov. 2026')).toBe('13/11/2026')
    expect(normalizeDateQuery('1 settembre 26')).toBe('01/09/2026')
    expect(normalizeDateQuery('novembre')).toBe('/11/')
    expect(normalizeDateQuery('mar 2027')).toBe('/03/2027')
  })

  it('leaves other text alone', () => {
    expect(normalizeDateQuery('Rossi')).toBeNull()
    expect(normalizeDateQuery('ma')).toBeNull()
    expect(normalizeDateQuery('32/11')).toBeNull()
    expect(normalizeDateQuery('13/13')).toBeNull()
    expect(normalizeDateQuery('2026')).toBeNull()
  })
})
