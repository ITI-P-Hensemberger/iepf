'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { endImpersonation, readCookie } from '@/lib/auth-client'

type ImpersonationInfo = {
  role?: string
  email?: string
}

// Who is being impersonated, as one string so the snapshot stays the same between reads.
function readImpersonationKey() {
  if (readCookie('iepf_impersonating') !== 'true') return ''
  return JSON.stringify([readCookie('iepf_impersonated_role'), readCookie('iepf_impersonated_email')])
}

// Impersonation starts and ends with a full reload: nothing to listen to in between.
function subscribeNever() {
  return () => {}
}

export default function ImpersonationBanner() {
  const [isEnding, setIsEnding] = React.useState(false)
  const bannerRef = React.useRef<HTMLDivElement | null>(null)

  // The cookies only exist in the browser: on the server, and before hydration, there is no banner.
  const cookieKey = React.useSyncExternalStore(subscribeNever, readImpersonationKey, () => '')
  const info = React.useMemo<ImpersonationInfo | null>(() => {
    if (!cookieKey) return null
    const [role, email] = JSON.parse(cookieKey) as [string | null, string | null]
    return { role: role ?? undefined, email: email ?? undefined }
  }, [cookieKey])

  React.useEffect(() => {
    const root = document.documentElement
    const banner = bannerRef.current
    if (!banner) {
      return
    }

    const applyHeight = () => {
      root.style.setProperty(
        '--impersonation-banner-height',
        `${banner.offsetHeight}px`
      )
    }

    applyHeight()
    const observer = new ResizeObserver(() => applyHeight())
    observer.observe(banner)

    return () => {
      observer.disconnect()
      root.style.setProperty('--impersonation-banner-height', '0px')
    }
  }, [info])

  if (!info) {
    return null
  }

  async function handleEndImpersonation() {
    setIsEnding(true)
    try {
      await endImpersonation()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Impossibile terminare l'impersonazione."
      )
      setIsEnding(false)
    }
  }

  const label = info.email
    ? `Stai impersonando ${info.email.split('@')[0]}${info.role ? ` (${info.role})` : ''}`
    : 'Stai impersonando un utente.'

  return (
    <div
      ref={bannerRef}
      className='sticky top-0 z-50 border-b border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950 dark:text-amber-100'
    >
      <div className='container mx-auto px-4 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <span className='text-sm font-medium'>{label}</span>
        <Button
          variant='outline'
          size='sm'
          onClick={handleEndImpersonation}
          disabled={isEnding}
        >
          {isEnding ? 'Termino...' : 'Termina impersonazione'}
        </Button>
      </div>
    </div>
  )
}
