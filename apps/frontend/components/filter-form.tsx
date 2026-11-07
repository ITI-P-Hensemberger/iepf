'use client'

import * as React from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'

import { SearchField } from '@/components/search-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function differs(draft: object, applied: object) {
  const a = applied as Record<string, unknown>
  return Object.entries(draft).some(([key, value]) => JSON.stringify(value ?? null) !== JSON.stringify(a[key] ?? null))
}

// The top of every list: a search field that stays under the header while the list scrolls,
// and the other filters in a panel closed by default. Filters apply as they change, a moment
// after the last one (so typing does not reload at every letter), and only when they differ
// from the ones already applied: refilling the fields from the URL (on load, or back from a
// detail page) keeps the page the list was on. Sorting is on the column headers.
export function FilterForm({
  values,
  applied,
  onSubmit,
  search,
  activeFilters = 0,
  onReset,
  delay = 400,
  className,
  children
}: {
  values: object
  applied: object
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  search: { id: string, value: string, onChange: (value: string) => void, placeholder: string }
  // How many filters in the panel are set, shown on its button.
  activeFilters?: number
  onReset?: () => void
  delay?: number
  className?: string
  // The filters in the panel; without them there is only the search.
  children?: React.ReactNode
}) {
  const ref = React.useRef<HTMLFormElement>(null)
  const [open, setOpen] = React.useState(false)
  const barRef = React.useRef<HTMLDivElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  // The panel opens in the page, above the list. If the list was scrolled the panel is out of
  // sight behind the sticky bar: bring it just under the bar.
  React.useEffect(() => {
    if (!open) return
    const bar = barRef.current?.getBoundingClientRect()
    const panel = panelRef.current?.getBoundingClientRect()
    if (!bar || !panel || panel.top >= bar.bottom) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: window.scrollY + panel.top - bar.bottom, behavior: reduce ? 'auto' : 'smooth' })
  }, [open])
  const panelId = React.useId()
  const key = JSON.stringify(values)
  const latest = React.useRef({ values, applied })
  React.useEffect(() => {
    latest.current = { values, applied }
  })

  React.useEffect(() => {
    if (!differs(latest.current.values, latest.current.applied)) return
    const timer = window.setTimeout(() => {
      if (differs(latest.current.values, latest.current.applied)) ref.current?.requestSubmit()
    }, delay)
    return () => window.clearTimeout(timer)
  }, [key, delay])

  return (
    // contents: the bar sticks along the whole list that follows the form, not only the form.
    <form ref={ref} onSubmit={onSubmit} className='contents'>
      <div ref={barRef} className={cn('sticky top-[var(--app-header-bottom)] z-30 -mx-4 bg-background/95 px-4 py-3 backdrop-blur', className)}>
        <div className='flex gap-2'>
          <SearchField {...search} className='flex-1' />
          {children && (
            <Button
              type='button'
              variant='outline'
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen(value => !value)}
            >
              <SlidersHorizontal className='size-4' />
              <span className='hidden sm:inline'>Filtri</span>
              {activeFilters > 0 && <Badge variant='secondary' className='px-1.5'>{activeFilters}</Badge>}
              <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {children && open && (
        <div ref={panelRef} id={panelId} className='mb-4 rounded-lg border bg-card p-4'>
          {children}
          {onReset && (
            <div className='mt-4 flex justify-end'>
              <Button variant='ghost' size='sm' type='button' onClick={onReset}>Azzera filtri</Button>
            </div>
          )}
        </div>
      )}
    </form>
  )
}
