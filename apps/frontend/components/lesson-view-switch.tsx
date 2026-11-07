'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Button } from '@/components/ui/button'

// Switches a lessons page between its views through ?view=, dropping the other view's filters.
export function LessonViewSwitch({ views, current }: { views: Array<{ key: string, label: string }>, current: string }) {
  const pathname = usePathname()
  return (
    <div className='inline-flex rounded-lg border border-input bg-card p-0.5 shadow-xs dark:bg-transparent' role='group' aria-label='Vista'>
      {views.map((view, index) => (
        <Button
          key={view.key}
          asChild
          size='sm'
          variant='ghost'
          className={view.key === current ? 'bg-primary/15 text-[var(--primary-text)] hover:bg-primary/20 hover:text-[var(--primary-text)]' : 'text-muted-foreground'}
          aria-pressed={view.key === current}
        >
          <Link href={index === 0 ? pathname : `${pathname}?view=${view.key}`} scroll={false}>
            {view.label}
          </Link>
        </Button>
      ))}
    </div>
  )
}
