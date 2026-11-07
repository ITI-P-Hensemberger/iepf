import { describe, expect, it } from 'vitest'

import { parkUserTheme, takeUserTheme } from './guest-theme'

function memory() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key)
  }
}

describe('theme of signed-out visitors', () => {
  it('puts the user\'s theme aside on logout and gives it back at login', () => {
    const storage = memory()
    storage.setItem('theme', 'dark')
    expect(parkUserTheme(storage)).toBe(true)
    expect(storage.getItem('theme')).toBeNull()
    expect(takeUserTheme(storage)).toBe('dark')
    expect(takeUserTheme(storage)).toBeNull()
  })

  it('leaves a first visit alone', () => {
    const storage = memory()
    expect(parkUserTheme(storage)).toBe(false)
    expect(storage.data.size).toBe(0)
  })
})
