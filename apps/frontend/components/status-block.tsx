import * as React from 'react'
import Image from 'next/image'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

// A page that only says where things stand (maintenance, page not found, an error, an account
// still to be activated): the logo, an icon, a title, a few lines and the way out, centred.
export function StatusBlock({
  icon: Icon,
  title,
  children,
  actions,
  footer,
  wide = false
}: {
  icon: LucideIcon
  title: React.ReactNode
  // The lines under the title.
  children?: React.ReactNode
  // The buttons: one under the other on a phone, side by side on a computer.
  actions?: React.ReactNode
  // Small print under the buttons, or longer content such as a checklist.
  footer?: React.ReactNode
  // For a footer that needs room.
  wide?: boolean
}) {
  return (
    <div className='flex min-h-[70dvh] w-full flex-1 items-center justify-center px-4 py-12'>
      <div className={cn('flex w-full flex-col items-center text-center', wide ? 'max-w-2xl' : 'max-w-md')}>
        <Image
          src='/logo.png'
          alt='IEPF'
          width={88}
          height={88}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
        <div className='mt-8 flex size-12 items-center justify-center rounded-full bg-muted'>
          <Icon className='size-5 text-muted-foreground' aria-hidden />
        </div>
        <h1 className='mt-4 text-2xl font-semibold tracking-tight'>{title}</h1>
        {children && <div className='mt-3 max-w-md text-muted-foreground'>{children}</div>}
        {actions && <div className='mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center'>{actions}</div>}
        {footer && <div className='mt-6 w-full'>{footer}</div>}
      </div>
    </div>
  )
}
