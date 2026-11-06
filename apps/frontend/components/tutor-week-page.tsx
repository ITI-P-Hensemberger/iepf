'use client'

// The tutor's week: every lesson by day with who booked it and what for, presence for the
// lesson under way, and cancelling a slot nobody booked.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { extractPayloadArray } from '@/lib/backend-response'
import {
  canMarkPresence,
  isCanceled,
  lessonsByDay,
  subjectLabel,
  type ScheduleBooking,
  type ScheduleLesson
} from '@/lib/lesson-schedule'
import { addDaysToKey, dateOfKey, dayKeyOf, mondayOf, schoolDays, weekRange } from '@/lib/school-week'
import { cn } from '@/lib/utils'

const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
const shortFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default function TutorWeekPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const todayKey = dayKeyOf(new Date())
  const mondayKey = mondayOf(searchParams.get('week') ?? todayKey)

  const [lessons, setLessons] = React.useState<ScheduleLesson[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = React.useState<ScheduleLesson | null>(null)

  const goToWeek = (key: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('week', key)
    router.replace(`${pathname}?${params}`, { scroll: false })
  }

  // After an action the week refreshes in place, without the skeleton that would scroll it away.
  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const response = await fetch(`/api/lessons/schedule?${new URLSearchParams(weekRange(mondayKey))}`)
      if (!response.ok) throw new Error('Impossibile caricare le lezioni.')
      setLessons(extractPayloadArray<ScheduleLesson>(await response.json()))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile caricare le lezioni.')
    } finally {
      setLoading(false)
    }
  }, [mondayKey])

  React.useEffect(() => {
    void load()
  }, [load])

  const savePresence = async (lesson: ScheduleLesson, booking: ScheduleBooking, present: boolean) => {
    setSaving(booking.id)
    try {
      const response = await fetch(`/api/lessons/${lesson.id}/bookings/${booking.id}/presence`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ present: booking.studentPresence === present ? null : present })
      })
      if (!response.ok) throw new Error('Impossibile aggiornare la presenza.')
      await load(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile aggiornare la presenza.')
    } finally {
      setSaving(null)
    }
  }

  const cancelLesson = async () => {
    if (!cancelTarget) return
    try {
      const response = await fetch(`/api/lessons/${cancelTarget.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (!response.ok) throw new Error('Impossibile annullare la lezione.')
      toast.success('Lezione annullata.')
      setCancelTarget(null)
      await load(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile annullare la lezione.')
    }
  }

  const byDay = lessonsByDay(lessons)
  const days = schoolDays(mondayKey)
  const running = lessons.filter((lesson) => !isCanceled(lesson))
  const students = running.reduce((sum, lesson) => sum + lesson.bookings.length, 0)
  const capacity = lessons[0]?.tutorDailyCapacity
  const subjects = [...new Set(lessons.flatMap((lesson) => lesson.subjectOptions.map((option) => option.name)))]

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button variant='outline' size='icon' aria-label='Settimana precedente' onClick={() => goToWeek(addDaysToKey(mondayKey, -7))}>
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <span className='min-w-40 text-center font-medium'>
          {shortFormat.format(dateOfKey(days[0]))} – {shortFormat.format(dateOfKey(days[4]))}
        </span>
        <Button variant='outline' size='icon' aria-label='Settimana successiva' onClick={() => goToWeek(addDaysToKey(mondayKey, 7))}>
          <ChevronRight className='h-4 w-4' />
        </Button>
        {mondayKey !== mondayOf(todayKey) && (
          <Button variant='ghost' size='sm' onClick={() => goToWeek(todayKey)}>Questa settimana</Button>
        )}
        <span className='ml-auto text-sm text-muted-foreground'>
          {running.length} {running.length === 1 ? 'lezione' : 'lezioni'} · {students} {students === 1 ? 'studente' : 'studenti'}
          {capacity ? ` · ${capacity} ${capacity === 1 ? 'posto' : 'posti'} al giorno` : ''}
        </span>
      </div>
      {subjects.length > 0 && (
        <p className='text-sm text-muted-foreground'>
          Le lezioni senza materia la ricevono dal primo studente che prenota, tra: {subjects.join(', ')}.
        </p>
      )}

      {loading ? (
        <div className='space-y-3'>
          <Skeleton className='h-24' />
          <Skeleton className='h-24' />
        </div>
      ) : (
        days.map((day) => {
          const dayLessons = byDay.get(day) ?? []
          return (
            <section key={day} className={cn('rounded-lg border bg-card', day < todayKey && 'opacity-80')}>
              <header className='flex items-center gap-2 border-b px-4 py-2'>
                <h3 className='font-medium'>{capitalize(dayFormat.format(dateOfKey(day)))}</h3>
                {day === todayKey && <Badge>Oggi</Badge>}
              </header>
              {dayLessons.length === 0 ? (
                <p className='px-4 py-3 text-sm text-muted-foreground'>Nessuna lezione.</p>
              ) : (
                <ul className='divide-y'>
                  {dayLessons.map((lesson) => (
                    <TutorLessonRow
                      key={lesson.id}
                      lesson={lesson}
                      saving={saving}
                      onPresence={savePresence}
                      onCancel={() => setCancelTarget(lesson)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })
      )}

      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare la lezione?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && `${capitalize(dayFormat.format(new Date(cancelTarget.startAt)))} alle ${timeFormat.format(new Date(cancelTarget.startAt))}. `}
              Nessuno l&apos;ha prenotata: gli studenti non la vedranno più.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Indietro</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void cancelLesson()
              }}
            >
              Annulla lezione
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function TutorLessonRow({
  lesson,
  saving,
  onPresence,
  onCancel
}: {
  lesson: ScheduleLesson
  saving: string | null
  onPresence: (lesson: ScheduleLesson, booking: ScheduleBooking, present: boolean) => void
  onCancel: () => void
}) {
  const start = new Date(lesson.startAt)
  const end = new Date(start.getTime() + lesson.durationMinutes * 60_000)
  const canceled = isCanceled(lesson)
  const presenceOpen = canMarkPresence(lesson)
  const past = end < new Date()
  const count = lesson.bookings.length
  return (
    <li className={cn('space-y-2 px-4 py-3', canceled && 'text-muted-foreground')}>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='font-medium'>{timeFormat.format(start)}–{timeFormat.format(end)}</span>
        <span className={cn(!lesson.subjectId && 'text-muted-foreground')}>· {subjectLabel(lesson)}</span>
        {canceled ? (
          <Badge variant='outline'>Annullata</Badge>
        ) : (
          <Badge variant={count >= lesson.seats ? 'default' : 'secondary'}>{count}/{lesson.seats}</Badge>
        )}
        <span className='ml-auto flex items-center gap-1'>
          {!canceled && count === 0 && !past && (
            <Button variant='ghost' size='sm' className='text-destructive' onClick={onCancel}>Annulla</Button>
          )}
          <Button asChild variant='ghost' size='icon' aria-label='Dettagli lezione'>
            <Link href={`/tutor/lessons/${lesson.id}`}><ExternalLink className='h-4 w-4' /></Link>
          </Button>
        </span>
      </div>
      {!canceled && count === 0 && (
        <p className='text-sm text-muted-foreground'>
          {past
            ? 'Nessuno ha prenotato.'
            : lesson.bookingsOpen
              ? 'Ancora nessuna prenotazione.'
              : 'Nessuna prenotazione: verrà eliminata stanotte.'}
        </p>
      )}
      {count > 0 && (
        <ul className='space-y-2'>
          {lesson.bookings.map((booking) => (
            <li key={booking.id} className='flex flex-col gap-2 rounded-md bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between'>
              <div className='min-w-0 text-sm'>
                <span className='font-medium'>{booking.studentName}</span>
                {booking.classLabel && <span className='text-muted-foreground'> · {booking.classLabel}</span>}
                <div className='text-muted-foreground'>&ldquo;{booking.topic}&rdquo;</div>
              </div>
              {presenceOpen ? (
                <div className='flex shrink-0 gap-1'>
                  <Button
                    size='sm'
                    variant={booking.studentPresence === true ? 'default' : 'outline'}
                    disabled={saving === booking.id}
                    onClick={() => onPresence(lesson, booking, true)}
                  >
                    Presente
                  </Button>
                  <Button
                    size='sm'
                    variant={booking.studentPresence === false ? 'destructive' : 'outline'}
                    disabled={saving === booking.id}
                    onClick={() => onPresence(lesson, booking, false)}
                  >
                    Assente
                  </Button>
                </div>
              ) : past ? (
                <Badge variant='outline' className='shrink-0'>
                  {booking.studentPresence === true ? 'Presente' : booking.studentPresence === false ? 'Assente' : 'Presenza non segnata'}
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
