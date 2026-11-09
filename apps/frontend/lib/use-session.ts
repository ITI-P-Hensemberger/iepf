'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'

export type SessionProfile = {
  id?: string
  email?: string
  firstName?: string
  lastName?: string
  role?: string | null
  sectionId?: string | null
  year?: number | null
  lessonTokens?: number | null
  isActive?: boolean | null
}

type UseSessionResult = {
  profile: SessionProfile | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  refresh: () => Promise<void>
}

export const SESSION_KEY = ['session']

async function fetchSession(): Promise<SessionProfile | null> {
  const response = await fetch('/api/auth/session', { cache: 'no-store' }).catch(() => {
    throw new Error('Impossibile recuperare la sessione.')
  })
  // Signed out (or the session expired): no profile, not an error.
  if (!response.ok) return null
  return (await response.json()) as SessionProfile | null
}

// The signed-in user, read once for every guard, header and page on screen, and again when a new
// page mounts. The login drops it (logout and impersonation reload the page), so no guard sees
// the signed-out answer from before.
export function useSession(): UseSessionResult {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: fetchSession,
    retry: false,
    meta: { inline: true }
  })

  const { refetch } = query
  const refresh = React.useCallback(async () => {
    await refetch()
  }, [refetch])

  const profile = query.data ?? null
  return {
    profile,
    // Only the first load: a reread keeps what is on screen, so the guards never unmount the page.
    isLoading: query.isPending,
    isAuthenticated: Boolean(profile),
    error: query.error?.message ?? null,
    refresh
  }
}
