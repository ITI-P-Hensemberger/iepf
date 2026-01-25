'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

type BackButtonProps = {
  label?: string
  fallbackHref?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  className?: string
  icon?: React.ReactNode
}

export function BackButton({
  label = 'Indietro',
  fallbackHref = '/',
  variant = 'ghost',
  size = 'sm',
  className,
  icon = <ChevronLeft className='h-4 w-4' />
}: BackButtonProps) {
  const router = useRouter()

  return (
    <Button
      type='button'
      variant={variant}
      size={size}
      className={[ 'gap-2', className ].filter(Boolean).join(' ')}
      onClick={() => {
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
