'use client'

// One school day at a glance: every tutor's lessons (or every subject's), what is booked, what
// is still open, and a click away from each lesson's details.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
import { OPEN_SUBJECT_LABEL } from '@/lib/lesson-subject'
import { addDaysToKey, dateOfKey, dayKeyOf, dayRange } from '@/lib/school-week'
import { cn } from '@/lib/utils'

const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

type Grouping = 'tutor' | 'subject'

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

  const summary = daySummary(lessons)
  const groups = grouping === 'tutor'
    ? [...groupBy(lessons, (lesson) => lesson.tutorId).values()]
        .sort((a, b) => a[0].tutorName.localeCompare(b[0].tutorName, 'it'))
    : [...groupBy(lessons, (lesson) => subjectLabel(lesson)).entries()]
        .sort(([a], [b]) => (a === OPEN_SUBJECT_LABEL ? 1 : b === OPEN_SUBJECT_LABEL ? -1 : a.localeCompare(b, 'it')))
        .map(([, list]) => list)

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button variant='outline' size='icon' aria-label='Giorno precedente' onClick={() => setParam('day', stepSchoolDay(dayKey, -1))}>
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <span className='min-w-52 text-center font-medium'>{capitalize(dayFormat.format(dateOfKey(dayKey)))}</span>
        <Button variant='outline' size='icon' aria-label='Giorno successivo' onClick={() => setParam('day', stepSchoolDay(dayKey, 1))}>
          <ChevronRight className='h-4 w-4' />
        </Button>
        {dayKey !== firstSchoolDay(todayKey) && (
          <Button variant='ghost' size='sm' onClick={() => setParam('day', firstSchoolDay(todayKey))}>Oggi</Button>
        )}
        <div className='ml-auto w-44'>
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
      </div>

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
        <p className='rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground'>Nessuna lezione in questo giorno.</p>
      ) : (
        <div className='divide-y rounded-lg border bg-card'>
          {groups.map((group) => (
            <GroupRow key={grouping === 'tutor' ? group[0].tutorId : subjectLabel(group[0])} lessons={group} grouping={grouping} />
          ))}
        </div>
      )}
      <p className='text-xs text-muted-foreground'>
        Bordo tratteggiato: lezione ancora senza materia, la sceglie il primo studente che prenota.
        Le lezioni mai prenotate vengono eliminate la notte dopo la chiusura delle prenotazioni.
      </p>
    </div>
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
      <div className='sm:w-48 sm:shrink-0'>
        {grouping === 'tutor' ? (
          <>
            <div className='font-medium'>{first.tutorName}</div>
            <div className='text-xs text-muted-foreground'>
              {first.tutorYear ? `${first.tutorYear}ª · ` : ''}{booked}/{first.tutorDailyCapacity} posti del giorno
            </div>
          </>
        ) : (
          <>
            <div className={cn('font-medium', !first.subjectId && 'text-muted-foreground')}>{subjectLabel(first)}</div>
            <div className='text-xs text-muted-foreground'>{booked} {booked === 1 ? 'studente' : 'studenti'}</div>
          </>
        )}
      </div>
      <div className='flex flex-wrap gap-2'>
        {lessons.map((lesson) => <LessonChip key={lesson.id} lesson={lesson} grouping={grouping} />)}
      </div>
    </div>
  )
}

function LessonChip({ lesson, grouping }: { lesson: ScheduleLesson, grouping: Grouping }) {
  const canceled = isCanceled(lesson)
  const count = lesson.bookings.length
  const open = !lesson.subjectId
  const students = lesson.bookings.map((booking) => `${booking.studentName}: ${booking.topic}`).join('\n')
  return (
    <Link
      href={`/admin/lessons/${lesson.id}`}
      title={students || undefined}
      className={cn(
        'flex min-w-36 flex-col gap-0.5 rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary',
        open && !canceled && 'border-dashed',
        canceled && 'text-muted-foreground line-through decoration-muted-foreground/60'
      )}
    >
      <span className='text-xs text-muted-foreground'>
        {timeFormat.format(new Date(lesson.startAt))}
        {grouping === 'subject' && ` · ${lesson.tutorName}`}
      </span>
      <span className={cn(open && 'text-muted-foreground')}>
        {grouping === 'tutor' ? subjectLabel(lesson) : null}
        {canceled
          ? (grouping === 'tutor' ? ' · annullata' : 'Annullata')
          : `${grouping === 'tutor' ? ' · ' : ''}${count}/${lesson.seats}`}
      </span>
      {!canceled && count === 0 && !lesson.bookingsOpen && (
        <span className='text-xs text-muted-foreground'>prenotazioni chiuse</span>
      )}
    </Link>
  )
}
