'use client'

export async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST'
  })
  // Use window.location.href for a full page reload to avoid any stale state
  window.location.href = '/auth/login'
}
