import { describe, expect, it } from 'vitest'

import { capitalizeFirst } from './capitalize'

describe('capitalizeFirst', () => {
  it('capitalizes the first letter and leaves the rest alone', () => {
    expect(capitalizeFirst('equazioni di secondo grado')).toBe('Equazioni di secondo grado')
    expect(capitalizeFirst('è andata bene, ripassare iPhone')).toBe('È andata bene, ripassare iPhone')
    expect(capitalizeFirst('  ripasso')).toBe('  Ripasso')
    expect(capitalizeFirst('Già maiuscola')).toBe('Già maiuscola')
  })

  it('keeps text that does not open with a letter, and links', () => {
    expect(capitalizeFirst('')).toBe('')
    expect(capitalizeFirst('3 esercizi')).toBe('3 esercizi')
    expect(capitalizeFirst('# titolo')).toBe('# titolo')
    expect(capitalizeFirst('https://hensemberger.it')).toBe('https://hensemberger.it')
    expect(capitalizeFirst('www.hensemberger.it')).toBe('www.hensemberger.it')
  })
})
