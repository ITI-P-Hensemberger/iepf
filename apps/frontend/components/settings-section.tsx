import * as React from 'react'

import { STICKY_TOP_ACTIONS } from '@/components/sticky-footer'
import { cn } from '@/lib/utils'

// Every section of the global settings opens the same way: its title, a line on what it does,
// and its actions (save, add) on the right, staying in view while the section scrolls.
export function SettingsSection({
  title,
  description,
  actions,
  children
}: {
  title: string
  description: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className='space-y-6'>
      <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', STICKY_TOP_ACTIONS)}>
        <div className='min-w-0 space-y-1'>
          <h2 className='text-xl font-semibold'>{title}</h2>
          <p className='text-sm text-muted-foreground'>{description}</p>
        </div>
        {actions && <div className='flex flex-col gap-2 sm:shrink-0 sm:flex-row'>{actions}</div>}
      </header>
      {children}
    </section>
  )
}
