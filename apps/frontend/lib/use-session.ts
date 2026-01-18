'use client'

import * as React from 'react'

export type SessionProfile = {
  id?: string
  email?: string
  firstName?: string
  lastName?: string
  role?: string | null
  sectionId?: string | null
  year?: number | null
  isActive?: boolean | null
}

type UseSessionResult = {
  profile: SessionProfile | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useSession(): UseSessionResult {
  const [profile, setProfile] = React.useState<SessionProfile | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const fetchSession = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' })
      if (!response.ok) {
        setProfile(null)
        setIsLoading(false)
        return
      }
      const data = (await response.json()) as SessionProfile | null
      setProfile(data)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossibile recuperare la sessione.'
      )
      setProfile(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void fetchSession()
  }, [fetchSession])

  return {
    profile,
    isLoading,
    isAuthenticated: Boolean(profile),
    error,
    refresh: fetchSession
  }
}
