'use client'

export async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST'
  })
  // A full reload guarantees nothing about this user stays in memory for the next one.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = '/auth/login'
}
