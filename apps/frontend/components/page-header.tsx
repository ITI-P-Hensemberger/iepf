import * as React from 'react'

import { BackButton } from '@/components/back-button'

// The top of an inner page: the back button, the title with an optional line under it, and the
// page's buttons beside the title (below it on a phone). Every inner page starts the same way.
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
  className
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  // Without it the button goes back in the history.
  backHref?: string
  backLabel?: string
  className?: string
}) {
  return (
    <div className={className}>
      <BackButton href={backHref} label={backLabel} />
      <div className='mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='min-w-0'>
          <h1 className='text-2xl break-words'>{title}</h1>
          {description && <div className='mt-1 text-sm text-muted-foreground'>{description}</div>}
        </div>
        {actions && <div className='flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-center'>{actions}</div>}
      </div>
    </div>
  )
}
