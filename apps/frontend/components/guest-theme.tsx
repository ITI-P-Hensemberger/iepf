'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'

import { parkUserTheme, takeUserTheme } from '@/lib/guest-theme'
import { useSession } from '@/lib/use-session'

// Applies lib/guest-theme: system theme while signed out, the user's own once signed in.
export function GuestTheme() {
  const pathname = usePathname()
  const { isAuthenticated, isLoading, refresh } = useSession()
  const { setTheme } = useTheme()
  // setTheme changes with the theme: the effect below must not run again when the user picks one.
  const setThemeRef = React.useRef(setTheme)
  React.useEffect(() => {
    setThemeRef.current = setTheme
  })

  // Login and logout move to another page: read the session again there, or a fresh login would
  // still look signed out until a reload.
  const firstPath = React.useRef(pathname)
  React.useEffect(() => {
    if (pathname === firstPath.current) return
    firstPath.current = pathname
    void refresh()
  }, [pathname, refresh])

  // Only when the signed-in state settles or changes, never on a theme pick.
  React.useEffect(() => {
    if (isLoading) return
    try {
      if (!isAuthenticated) {
        if (parkUserTheme(window.localStorage)) setThemeRef.current('system')
        return
      }
      const parked = takeUserTheme(window.localStorage)
      if (parked) setThemeRef.current(parked)
    } catch {
      // Storage blocked (private browsing): the system theme stays.
    }
  }, [isAuthenticated, isLoading])

  return null
}
