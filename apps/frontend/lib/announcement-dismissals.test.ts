import { describe, expect, it } from 'vitest'

import { type ActiveAnnouncement, type DismissMode, isDismissedHere, rememberDismissal, startLoginSession } from './announcement-dismissals'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value)
  }
}

function popup(dismissMode: DismissMode, id = dismissMode): ActiveAnnouncement {
  return { id, title: 'T', body: 'B', linkUrl: null, linkLabel: null, dismissMode }
}

describe('dismissals kept by the browser', () => {
  it('once_device stays closed across logins, per user', () => {
    const storage = memoryStorage()
    startLoginSession(storage, 'login-1')
    rememberDismissal(storage, 'alice', popup('once_device'))
    startLoginSession(storage, 'login-2')
    expect(isDismissedHere(storage, 'alice', popup('once_device'))).toBe(true)
    expect(isDismissedHere(storage, 'bob', popup('once_device'))).toBe(false)
  })

  it('every_session comes back at the next login', () => {
    const storage = memoryStorage()
    startLoginSession(storage, 'login-1')
    rememberDismissal(storage, 'alice', popup('every_session'))
    expect(isDismissedHere(storage, 'alice', popup('every_session'))).toBe(true)
    startLoginSession(storage, 'login-2')
    expect(isDismissedHere(storage, 'alice', popup('every_session'))).toBe(false)
  })

  it('once_account is left to the server', () => {
    const storage = memoryStorage()
    rememberDismissal(storage, 'alice', popup('once_account'))
    expect(isDismissedHere(storage, 'alice', popup('once_account'))).toBe(false)
  })

  it('shows the popup again when storage is unreadable or broken', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      }
    }
    expect(() => rememberDismissal(broken, 'alice', popup('once_device'))).not.toThrow()
    expect(isDismissedHere(broken, 'alice', popup('once_device'))).toBe(false)

    const storage = memoryStorage()
    storage.setItem('iepf:popups:device:alice', '{not json')
    expect(isDismissedHere(storage, 'alice', popup('once_device'))).toBe(false)
  })
})
