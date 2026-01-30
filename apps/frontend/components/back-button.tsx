'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

type BackButtonProps = {
  label?: string
  href?: string
  fallbackHref?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  className?: string
  icon?: React.ReactNode
}

export function BackButton({
  label = 'Indietro',
  href,
  fallbackHref = '/',
  variant = 'ghost',
  size = 'sm',
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
    <Button
      type='button'
      variant={variant}
      size={size}
      className={[ 'gap-2', className ].filter(Boolean).join(' ')}
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
    </Button>
  )
}
