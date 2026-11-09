'use client'

import { jsonBody } from '@/lib/api-fetch'
import { syncAppBadge } from '@/lib/app-badge'

const END_IMPERSONATION_ERROR = 'Impossibile terminare l\'impersonazione.'

export function readCookie(name: string) {
  if (typeof document === 'undefined') {
    return null
  }
  for (const cookie of document.cookie.split(';')) {
    const trimmed = cookie.trim()
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1))
    }
  }
  return null
}

// Set by the proxy while an admin acts as another user (readable flag, not a credential).
export function isImpersonating() {
  return readCookie('iepf_impersonating') === 'true'
}

// Back to the admin's own session.
export async function endImpersonation() {
  const response = await fetch('/api/admin/impersonate/end', { method: 'POST' })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(payload?.message ?? END_IMPERSONATION_ERROR)
  }
  // A full reload guarantees nothing about the impersonated user stays in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = '/admin'
}

export async function logout() {
  // While impersonating, "Esci" leaves the impersonated user, not the admin's own session.
  if (isImpersonating()) {
    try {
      await endImpersonation()
      return
    }
    catch {
      // Could not go back to the admin: sign out completely, which clears both sessions.
    }
  }
  await fetch('/api/auth/logout', {
    method: 'POST'
  })
  // The next person on this device must not see the previous user's count on the icon.
  await syncAppBadge(0)
  // Back to the landing, with a full reload: nothing about this user stays in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = '/'
}

// An invite link already used or expired gets its own message.
export async function confirmInvite(url: string, body: unknown) {
  const response = await fetch(url, jsonBody('POST', body)).catch(() => {
    throw new Error('Registrazione fallita.')
  })
  if (response.status === 401) throw new Error('Token scaduto o già utilizzato.')
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(payload?.message || 'Registrazione fallita.')
  }
}
