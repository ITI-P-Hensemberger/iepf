'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { cn } from '@/lib/utils'
import { ChevronLeft } from 'lucide-react'

type BackButtonProps = {
  label?: string
  href?: string
  fallbackHref?: string
  className?: string
  icon?: React.ReactNode
}

export function BackButton({
  label = 'Indietro',
  href,
  fallbackHref = '/',
  className,
  icon = <ChevronLeft className='h-4 w-4' />
}: BackButtonProps) {
  const router = useRouter()
  const normalizeHost = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    try {
      return new URL(trimmed).hostname.replace(/^www\./, '').toLowerCase()
    } catch {
      return trimmed
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .replace(/^www\./, '')
        .toLowerCase()
    }
  }

  const envDomain =
    process.env.NEXT_PUBLIC_APP_DOMAIN ??
    process.env.NEXT_PUBLIC_SITE_DOMAIN ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    ''
  const allowedHost = normalizeHost(
    envDomain ||
      (typeof window !== 'undefined' ? window.location.origin : '')
  )

  return (
    <button
      type='button'
      className={cn(
        // A pill, unlike the square buttons of the page: easy to spot, quiet, and its edge lines up
        // with the content below.
        'inline-flex h-8 items-center gap-1 rounded-full border bg-muted/50 pr-3.5 pl-2 text-sm font-medium text-foreground/80 transition-colors',
        'hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        className
      )}
      onClick={() => {
        if (href) {
          router.replace(href)
          return
        }
        const referrer =
          typeof document !== 'undefined' ? document.referrer : ''
        const referrerHost = normalizeHost(referrer)
        if (!referrerHost || (allowedHost && referrerHost !== allowedHost)) {
          router.replace('/')
          return
        }
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back()
        } else {
          router.replace(fallbackHref)
        }
      }}
    >
      {icon}
      {label}
    </button>
  )
}
