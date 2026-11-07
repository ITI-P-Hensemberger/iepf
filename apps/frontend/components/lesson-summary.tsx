// The top of a lesson's page for tutors and admins: what, when, with whom, how full, and the
// actions that fit its state.
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
  return (
    <div className='space-y-4'>
      <PageHeader
        title={(
          <span className='flex flex-wrap items-center gap-2'>
            {subjectName ?? 'Lezione'}
            <Badge variant={STATE_BADGE[state].variant} className='text-xs'>{STATE_BADGE[state].label}</Badge>
          </span>
        )}
        description={`${capitalize(dayFormat.format(start))}, ${timeFormat.format(start)}–${timeFormat.format(end)}${tutorName ? ` · ${tutorName}` : ''}`}
        backHref={backHref}
        actions={actions}
      />
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
