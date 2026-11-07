'use client'

import { syncAppBadge } from '@/lib/app-badge'

export async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST'
  })
  // The next person on this device must not see the previous user's count on the icon.
  await syncAppBadge(0)
  // A full reload guarantees nothing about this user stays in memory for the next one.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = '/auth/login'
}
