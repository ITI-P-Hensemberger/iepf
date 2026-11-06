import { describe, expect, it, vi } from 'vitest'

import { syncAppBadge } from './app-badge'

describe('syncAppBadge', () => {
  it('sets the count, and clears it at zero', async () => {
    const nav = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) }
    await syncAppBadge(3, nav as unknown as Navigator)
    await syncAppBadge(0, nav as unknown as Navigator)
    expect(nav.setAppBadge).toHaveBeenCalledWith(3)
    expect(nav.clearAppBadge).toHaveBeenCalledOnce()
  })

  it('does nothing where the browser has no badge or refuses it', async () => {
    await expect(syncAppBadge(2, {} as Navigator)).resolves.toBeUndefined()
    const refusing = { setAppBadge: vi.fn(async () => { throw new Error('NotAllowedError') }) }
    await expect(syncAppBadge(2, refusing as unknown as Navigator)).resolves.toBeUndefined()
  })
})
