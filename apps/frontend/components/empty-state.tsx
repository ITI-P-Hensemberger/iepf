import * as React from 'react'

import { cn } from '@/lib/utils'

// What a list or page shows when there is nothing in it: a short line and, where it helps, the
// action that fills it.
export function EmptyState({
  children,
  action,
  className
}: {
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground',
        className
      )}
    >
      <div>{children}</div>
      {action}
    </div>
  )
}
