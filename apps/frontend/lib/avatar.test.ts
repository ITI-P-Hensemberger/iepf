import { describe, expect, it } from 'vitest'

import { avatarGradient } from './avatar'

describe('avatarGradient', () => {
  it('is the same for the same email, whatever the case', () => {
    expect(avatarGradient('Anna.Villa@example.test')).toBe(avatarGradient('anna.villa@example.test'))
  })

  it('differs between almost all people', () => {
    const emails = Array.from({ length: 200 }, (_, index) => `student${index}@hensemberger.it`)
    const distinct = new Set(emails.map(avatarGradient))
    expect(distinct.size).toBeGreaterThan(190)
  })

  it('has a neutral fallback without an email', () => {
    expect(avatarGradient(null)).toContain('linear-gradient')
  })
})
