'use client'

// One school day at a glance: every tutor's lessons (or every subject's), what is booked, what
// is still open, and a click away from each lesson's details.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { extractPayloadArray } from '@/lib/backend-response'
import {
  daySummary,
  groupBy,
  isCanceled,
  subjectLabel,
  type ScheduleLesson
} from '@/lib/lesson-schedule'
import { addDaysToKey, dateOfKey, dayKeyOf, dayRange } from '@/lib/school-week'
import { cn } from '@/lib/utils'
import { useHere, withFrom } from '@/lib/back-link'
import { StickyBar } from '@/components/sticky-bar'
import { EmptyState } from '@/components/empty-state'

const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

export type Grouping = 'tutor' | 'subject'

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// Moves to the previous or next school day, skipping the weekend.
function stepSchoolDay(key: string, direction: 1 | -1) {
  let next = addDaysToKey(key, direction)
  while ([0, 6].includes(dateOfKey(next).getDay())) {
    next = addDaysToKey(next, direction)
  }
  return next
}

function firstSchoolDay(key: string) {
  return [0, 6].includes(dateOfKey(key).getDay()) ? stepSchoolDay(key, 1) : key
}

export default function AdminDayPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const todayKey = dayKeyOf(new Date())
  const dayKey = searchParams.get('day') ?? firstSchoolDay(todayKey)
  const grouping: Grouping = searchParams.get('group') === 'subject' ? 'subject' : 'tutor'

  const [lessons, setLessons] = React.useState<ScheduleLesson[]>([])
  const [loading, setLoading] = React.useState(true)

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.replace(`${pathname}?${params}`, { scroll: false })
  }

  React.useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`/api/lessons/schedule?${new URLSearchParams(dayRange(dayKey))}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Impossibile caricare le lezioni del giorno.')
        const items = extractPayloadArray<ScheduleLesson>(await response.json())
        if (active) setLessons(items)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Impossibile caricare le lezioni del giorno.'))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [dayKey])

  return (
    <div className='space-y-4'>
      <StickyBar className='flex flex-wrap items-center gap-2'>
        {/* One row on a phone too: arrows, the day, and the jump back to today. */}
        <div className='flex w-full items-center gap-2 sm:w-auto'>
          <Button variant='outline' size='icon' aria-label='Giorno precedente' onClick={() => setParam('day', stepSchoolDay(dayKey, -1))}>
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <span className='min-w-0 flex-1 truncate text-center font-medium sm:min-w-52 sm:flex-none'>{capitalize(dayFormat.format(dateOfKey(dayKey)))}</span>
          <Button variant='outline' size='icon' aria-label='Giorno successivo' onClick={() => setParam('day', stepSchoolDay(dayKey, 1))}>
            <ChevronRight className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            size='icon'
            aria-label='Torna a oggi'
            title='Oggi'
            disabled={dayKey === firstSchoolDay(todayKey)}
            onClick={() => setParam('day', firstSchoolDay(todayKey))}
          >
            <CalendarCheck className='h-4 w-4' />
          </Button>
        </div>
        <div className='w-full sm:ml-auto sm:w-44'>
          <Select value={grouping} onValueChange={(value) => setParam('group', value)}>
            <SelectTrigger className='w-full' aria-label='Raggruppa'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='tutor'>Per tutor</SelectItem>
              <SelectItem value='subject'>Per materia</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </StickyBar>

      <DayOverview lessons={lessons} loading={loading} grouping={grouping} />
      <p className='text-xs text-muted-foreground'>
        Bordo tratteggiato: lezione ancora senza materia, la sceglie il primo studente che prenota.
        Le lezioni mai prenotate vengono eliminate la notte dopo la chiusura delle prenotazioni.
      </p>
    </div>
  )
}

// The figures and the lessons of one day, grouped by tutor or by subject: the day view and
// the admin home both show it.
// from: the page the lesson's details should lead back to, when it is not the day view.
export function DayOverview({ lessons, loading, grouping }: { lessons: ScheduleLesson[], loading: boolean, grouping: Grouping }) {
  const summary = daySummary(lessons)
  const groups = grouping === 'tutor'
    ? [...groupBy(lessons, (lesson) => lesson.tutorId).values()]
        .sort((a, b) => a[0].tutorName.localeCompare(b[0].tutorName, 'it'))
    : [...groupBy(lessons, (lesson) => subjectLabel(lesson)).entries()]
        // Lessons nobody booked have no subject yet: they go last, together.
        .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'it')))
        .map(([, list]) => list)
  return (
    <>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <Figure label='Lezioni' value={summary.slots} />
        <Figure label='Studenti prenotati' value={summary.booked} />
        <Figure label='Posti ancora prenotabili' value={summary.free} />
        <Figure label='Senza materia' value={summary.open} />
      </div>
      {loading ? (
        <div className='space-y-2'>
          <Skeleton className='h-16' />
          <Skeleton className='h-16' />
          <Skeleton className='h-16' />
        </div>
      ) : lessons.length === 0 ? (
        <EmptyState>Nessuna lezione in questo giorno.</EmptyState>
      ) : (
        <div className='divide-y rounded-lg border bg-card'>
          {groups.map((group) => (
            <GroupRow key={grouping === 'tutor' ? group[0].tutorId : subjectLabel(group[0])} lessons={group} grouping={grouping} />
          ))}
        </div>
      )}
    </>
  )
}

function Figure({ label, value }: { label: string, value: number }) {
  return (
    <div className='rounded-lg bg-muted/50 px-4 py-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='text-2xl font-medium'>{value}</div>
    </div>
  )
}

function GroupRow({ lessons, grouping }: { lessons: ScheduleLesson[], grouping: Grouping }) {
  const first = lessons[0]
  const booked = lessons.filter((lesson) => !isCanceled(lesson)).reduce((sum, lesson) => sum + lesson.bookings.length, 0)
  return (
    <div className='flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start'>
      {/* The tutor or subject stays in view while its lessons scroll. */}
      <div className='sticky top-[var(--sticky-top)] z-10 -mx-4 bg-[var(--card)] px-4 py-1 sm:mx-0 sm:w-48 sm:shrink-0 sm:self-start sm:bg-transparent sm:px-0 sm:py-0'>
        {grouping === 'tutor' ? (
          <>
            <div className='font-medium'>{first.tutorName}</div>
            <div className='text-xs text-muted-foreground'>
              {first.tutorYear ? `${first.tutorYear}ª · ` : ''}{booked}/{first.tutorDailyCapacity} posti del giorno
            </div>
          </>
        ) : (
          <>
            <div className={cn('font-medium', !first.subjectId && 'text-muted-foreground')}>{subjectLabel(first) || 'Non ancora prenotate'}</div>
            <div className='text-xs text-muted-foreground'>{booked} {booked === 1 ? 'studente' : 'studenti'}</div>
          </>
        )}
      </div>
      {/* The lessons share the whole row equally, wrapping when they get too narrow. */}
      <div className='flex min-w-0 flex-1 flex-wrap gap-2'>
        {lessons.map((lesson) => <LessonChip key={lesson.id} lesson={lesson} grouping={grouping} />)}
      </div>
    </div>
  )
}

function LessonChip({ lesson, grouping }: { lesson: ScheduleLesson, grouping: Grouping }) {
  const here = useHere()
  const canceled = isCanceled(lesson)
  const count = lesson.bookings.length
  const open = !lesson.subjectId
  const students = lesson.bookings.map((booking) => `${booking.studentName}: ${booking.topic}`).join('\n')
  return (
    <Link
      href={withFrom(`/admin/lessons/${lesson.id}`, here)}
      title={students || undefined}
      className={cn(
        // A lesson tile: on the card colour with a light shadow, lifting under the pointer.
        'flex min-w-36 flex-1 basis-0 flex-col gap-0.5 rounded-lg border bg-card px-3 py-2 text-sm shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
        open && !canceled && 'border-dashed',
        canceled && 'text-muted-foreground line-through decoration-muted-foreground/60'
      )}
    >
      <span className='flex items-baseline gap-1.5'>
        <span className='text-base font-semibold tabular-nums text-foreground'>{timeFormat.format(new Date(lesson.startAt))}</span>
        {grouping === 'subject' && <span className='truncate text-xs text-muted-foreground'>{lesson.tutorName}</span>}
      </span>
      <span className={cn(open && 'text-muted-foreground')}>
        {grouping === 'tutor' && lesson.subjectId ? `${subjectLabel(lesson)} · ` : ''}
        {canceled ? 'Annullata' : `${count}/${lesson.seats}`}
      </span>
      {!canceled && count === 0 && !lesson.bookingsOpen && (
        <span className='text-xs text-muted-foreground'>prenotazioni chiuse</span>
      )}
    </Link>
  )
}
