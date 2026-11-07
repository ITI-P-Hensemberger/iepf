import * as React from 'react'

import { cn } from '@/lib/utils'

// Controls that stay under the header while the page scrolls, below 1024px: the section
// dropdown, the lesson filters, the day or week arrows. On a computer they stay in the page.
export function StickyBar({ className, children }: { className?: string, children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'sticky top-[var(--app-header-bottom)] z-30 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur',
        'lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none',
        className
      )}
    >
      {children}
    </div>
  )
}
