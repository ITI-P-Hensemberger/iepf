import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isMaintenanceOpenPath, maintenanceApplies, readMaintenance, resetMaintenanceCache } from './maintenance'

const on = { enabled: true, message: null, roles: ['student', 'tutor'] }

describe('isMaintenanceOpenPath', () => {
  it('leaves only the login and the FAQ open', () => {
    expect(isMaintenanceOpenPath('/auth/login')).toBe(true)
    expect(isMaintenanceOpenPath('/faq')).toBe(true)
    for (const path of ['/', '/auth/sign-up', '/auth/reset-password', '/privacy-policy', '/student', '/profile', '/student/pending', '/faqs']) {
      expect(isMaintenanceOpenPath(path)).toBe(false)
    }
  })
})

describe('maintenanceApplies', () => {
  it('is off when maintenance is off or unknown', () => {
    expect(maintenanceApplies(null, null)).toBe(false)
    expect(maintenanceApplies({ ...on, enabled: false }, 'student')).toBe(false)
  })

  it('reaches visitors and the listed roles, never admins or activators', () => {
    const tutorsOnly = { ...on, roles: ['tutor'] }
    expect(maintenanceApplies(tutorsOnly, null)).toBe(true)
    expect(maintenanceApplies(tutorsOnly, 'tutor')).toBe(true)
    expect(maintenanceApplies(tutorsOnly, 'student')).toBe(false)
    expect(maintenanceApplies({ ...on, roles: ['student', 'tutor', 'admin', 'activator'] }, 'admin')).toBe(false)
    expect(maintenanceApplies({ ...on, roles: ['student', 'tutor', 'admin', 'activator'] }, 'activator')).toBe(false)
  })
})

describe('readMaintenance', () => {
  beforeEach(() => resetMaintenanceCache())

  it('reads the backend and keeps the answer for a few seconds', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ enabled: true, message: 'Torniamo presto', roles: ['student'] }))
    const first = await readMaintenance('http://api', fetchImpl as unknown as typeof fetch, 1_000)
    expect(first).toEqual({ enabled: true, message: 'Torniamo presto', roles: ['student'] })
    await readMaintenance('http://api', fetchImpl as unknown as typeof fetch, 5_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await readMaintenance('http://api', fetchImpl as unknown as typeof fetch, 12_000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('leaves the site open when the backend cannot answer', async () => {
    const failing = vi.fn(async () => { throw new Error('down') })
    expect(await readMaintenance('http://api', failing as unknown as typeof fetch, 1_000)).toBeNull()
    expect(maintenanceApplies(null, null)).toBe(false)
  })
})
