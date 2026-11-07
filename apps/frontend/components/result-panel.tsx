import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const TONES = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  error: 'bg-destructive/10 text-destructive',
  info: 'bg-muted text-muted-foreground'
} as const

// What happened after a form or a link (registration done, email verified, link expired):
// an icon, a short title, a line, and the way on. The same shape as StatusBlock, in a card.
export function ResultPanel({
  icon: Icon,
  tone = 'info',
  title,
  children,
  action
}: {
  icon: LucideIcon
  tone?: keyof typeof TONES
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className='flex flex-col items-center rounded-xl border bg-card px-6 py-8 text-center shadow-sm' role='status'>
      <div className={cn('flex size-12 items-center justify-center rounded-full', TONES[tone])}>
        <Icon className='size-5' aria-hidden />
      </div>
      <h2 className='mt-4 text-lg font-semibold'>{title}</h2>
      {children && <div className='mt-2 text-sm text-muted-foreground'>{children}</div>}
      {action && <div className='mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row'>{action}</div>}
    </div>
  )
}
