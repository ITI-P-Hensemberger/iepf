'use client'

// The top of a lesson's page for tutors and admins: what, when, with whom, how full, and the
// actions that fit its state.
import * as React from 'react'

import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export type LessonState = 'canceled' | 'upcoming' | 'running' | 'done'

export function lessonStateOf(lesson: { status: string, startAt: string, durationMinutes: number }, now = new Date()): LessonState {
  if (lesson.status === 'canceled' || lesson.status === 'cancelled') return 'canceled'
  const start = new Date(lesson.startAt).getTime()
  const end = start + lesson.durationMinutes * 60_000
  if (now.getTime() < start) return 'upcoming'
  return now.getTime() < end ? 'running' : 'done'
}

const STATE_BADGE: Record<LessonState, { label: string, variant: 'secondary' | 'destructive' | 'success' | 'default' }> = {
  canceled: { label: 'Annullata', variant: 'destructive' },
  upcoming: { label: 'In programma', variant: 'secondary' },
  running: { label: 'In corso', variant: 'default' },
  done: { label: 'Conclusa', variant: 'success' }
}

export function LessonSummary({
  subjectName,
  startAt,
  durationMinutes,
  status,
  booked,
  seats,
  tutorName,
  note,
  actions,
  backHref
}: {
  subjectName: string | null
  startAt: string
  durationMinutes: number
  status: string
  booked: number
  seats: number
  tutorName?: string
  note?: React.ReactNode
  actions?: React.ReactNode
  // Where back leads when the page was not opened from another one (?from= wins).
  backHref: string
}) {
  const start = new Date(startAt)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const state = lessonStateOf({ status, startAt, durationMinutes })
  const when = `${capitalize(dayFormat.format(start))}, ${timeFormat.format(start)}–${timeFormat.format(end)}`
  // Once the page title has scrolled away, a slim bar keeps what the lesson is and its actions
  // in view while the list of students scrolls.
  const headerRef = React.useRef<HTMLDivElement>(null)
  const [compact, setCompact] = React.useState(false)
  React.useEffect(() => {
    const element = headerRef.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting && entry.boundingClientRect.top < 0))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div className='space-y-4'>
      <div
        className={cn(
          'fixed inset-x-0 top-[var(--app-header-bottom)] z-30 border-b bg-background/95 backdrop-blur transition-[opacity,translate] duration-200',
          compact ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        )}
        aria-hidden={!compact}
        inert={!compact}
      >
        <div className='container mx-auto px-4'>
          <div className='mx-auto flex max-w-6xl items-center gap-3 py-2'>
            <div className='min-w-0 flex-1'>
              <p className='flex items-center gap-2 truncate font-medium'>
                <span className='truncate'>{subjectName ?? 'Lezione'}</span>
                <Badge variant={STATE_BADGE[state].variant} className='text-xs'>{STATE_BADGE[state].label}</Badge>
              </p>
              <p className='truncate text-xs text-muted-foreground'>{when} · {booked}/{seats} studenti</p>
            </div>
            {actions && <div className='hidden shrink-0 items-center gap-2 md:flex [&_[data-slot=button]]:h-8'>{actions}</div>}
          </div>
        </div>
      </div>
      <div ref={headerRef}>
      <PageHeader
        title={(
          <span className='flex flex-wrap items-center gap-2'>
            {subjectName ?? 'Lezione'}
            <Badge variant={STATE_BADGE[state].variant} className='text-xs'>{STATE_BADGE[state].label}</Badge>
          </span>
        )}
        description={`${when}${tutorName ? ` · ${tutorName}` : ''}`}
        backHref={backHref}
        actions={actions}
      />
      </div>
      <div className='flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3'>
        <div className='flex items-baseline gap-2'>
          <span className='text-2xl font-medium tabular-nums'>{booked}/{seats}</span>
          <span className='text-sm text-muted-foreground'>studenti</span>
        </div>
        {note && <p className={cn('text-sm text-muted-foreground')}>{note}</p>}
      </div>
    </div>
  )
}
