'use client'

import * as React from 'react'

import { createRefreshingFetch, loginRedirect } from '@/lib/session-refresh'

const INSTALLED = Symbol.for('iepf.session-refresh')

// Wraps window.fetch once, so every /api call in the app renews an expired session by itself.
export function SessionRefresh() {
  React.useEffect(() => {
    const target = window as typeof window & { [INSTALLED]?: boolean }
    if (target[INSTALLED]) return
    target[INSTALLED] = true

    const original = window.fetch.bind(window)
    window.fetch = createRefreshingFetch(original, {
      origin: window.location.origin,
      isImpersonating: () => document.cookie.split('; ').includes('iepf_impersonating=true'),
      onSessionLost: () => {
        const destination = loginRedirect(window.location.pathname, window.location.search)
        if (!destination) return
        // A full load, like logout: nothing of the lost session stays in memory.
         
        window.location.assign(destination)
      }
    })
  }, [])

  return null
}
