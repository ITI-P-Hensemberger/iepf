import { describe, expect, it } from 'vitest'

import { PERSON_NAME_PATTERN } from './person-name'

describe('PERSON_NAME_PATTERN', () => {
  it('accepts letters joined by a straight or curly apostrophe', () => {
    for (const name of ['Mario', 'Niccolò', "D'Angelo", 'Dell’Orto', "Sant'Anna"]) {
      expect(PERSON_NAME_PATTERN.test(name)).toBe(true)
    }
  })

  it('rejects apostrophes that do not join two letters, and other symbols', () => {
    for (const name of ["'Angelo", "D'", "D''Angelo", 'Mario1', 'Ma-rio']) {
      expect(PERSON_NAME_PATTERN.test(name)).toBe(false)
    }
  })
})
