'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'

import { parkUserTheme, takeUserTheme } from '@/lib/guest-theme'
import { useSession } from '@/lib/use-session'

// Applies lib/guest-theme: system theme while signed out, the user's own once signed in.
export function GuestTheme() {
  const { isAuthenticated, isLoading } = useSession()
  const { setTheme } = useTheme()

  React.useEffect(() => {
    if (isLoading) return
    try {
      if (!isAuthenticated) {
        if (parkUserTheme(window.localStorage)) setTheme('system')
        return
      }
      const parked = takeUserTheme(window.localStorage)
      if (parked) setTheme(parked)
    } catch {
      // Storage blocked (private browsing): the system theme stays.
    }
  }, [isAuthenticated, isLoading, setTheme])

  return null
}
