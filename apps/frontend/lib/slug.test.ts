import { describe, expect, it } from 'vitest'

import { slugify } from '@/lib/slug'

describe('slugify', () => {
  it('keeps lowercase letters, digits and single dashes', () => {
    expect(slugify('Iscrizioni 2026/27')).toBe('iscrizioni-2026-27')
    expect(slugify('  Più   Città! ')).toBe('piu-citta')
    expect(slugify('--a__b--')).toBe('a-b')
    expect(slugify('!!!')).toBe('')
  })
})
