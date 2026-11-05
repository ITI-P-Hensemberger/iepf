'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

type ImpersonationInfo = {
  role?: string
  email?: string
}

function getCookieValue(name: string) {
  if (typeof document === 'undefined') {
    return null
  }
  const cookies = document.cookie.split(';').map((cookie) => cookie.trim())
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return decodeURIComponent(cookie.slice(name.length + 1))
    }
  }
  return null
}

export default function ImpersonationBanner() {
  const [info, setInfo] = React.useState<ImpersonationInfo | null>(null)
  const [isEnding, setIsEnding] = React.useState(false)
  const bannerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const isActive = getCookieValue('iepf_impersonating') === 'true'
    if (!isActive) {
      setInfo(null)
      return
    }
    setInfo({
      role: getCookieValue('iepf_impersonated_role') ?? undefined,
      email: getCookieValue('iepf_impersonated_email') ?? undefined
    })
  }, [])

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
      const response = await fetch('/api/admin/impersonate/end', {
        method: 'POST'
      })
      if (!response.ok) {
        let message = "Impossibile terminare l'impersonazione."
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch {
          message = "Impossibile terminare l'impersonazione."
        }
        throw new Error(message)
      }
      // A full reload guarantees nothing about the impersonated user stays in memory.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/admin'
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
