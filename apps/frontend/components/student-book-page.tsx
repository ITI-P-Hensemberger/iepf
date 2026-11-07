'use client'

// Booking in four steps: pick a subject, pick a day and a lesson, confirm with a topic, done.
// The step lives in the URL (?week, ?subject, ?day) so the back button walks back through it.
import { BlockSkeleton } from '@/components/loading'
import { EmptyState } from '@/components/empty-state'
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Bell,
  Check,
  CalendarDays,
  CircleCheck,
  Clock,
  Plus,
  Undo2
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
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
import { PageHeader } from '@/components/page-header'
import { LessonHoursBadge } from '@/components/lesson-hours-badge'
import { NoHoursCard } from '@/components/no-hours-notice'
import { openPushSetup, usePushSetup } from '@/components/push-prompt'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { extractPayloadArray } from '@/lib/backend-response'
import { hasNoHoursLeft } from '@/lib/lesson-hours'
import { lessonBookableSeats } from '@/lib/lesson-seats'
import { type SubjectOption } from '@/lib/lesson-subject'
import {
  addDaysToKey,
  dayKeyOf,
  dayRange,
  mondayOf,
  schoolDays,
  thisWeekBookable,
  weekRange
} from '@/lib/school-week'
import { track } from '@/lib/usage-analytics'
import { useSession } from '@/lib/use-session'
import { cn } from '@/lib/utils'
import { capitalizeFirst } from '@/lib/capitalize'

type LessonAvailable = {
  id: string
  tutorId: string
  tutorFirstName: string
  tutorLastName: string
  tutorYear: number | null
  // Null while the lesson is open: the first booking picks one of subjectOptions.
  subjectId: string | null
  subjectName: string | null
  subjectOptions: SubjectOption[]
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyCapacity: number
  dailyOccupancy: number
  availableSeats: number
  status: string
  bookingCutoff: string
  canBook: boolean
}

type Summary = {
  subjects: Array<SubjectOption & { count: number }>
  days: Array<{ day: string, count: number, booked: boolean }>
}

type MyLesson = {
  id: string
  subjectName: string
  tutorFirstName: string
  tutorLastName: string
  startAt: string
  bookingStatus: string
}

type Booked = {
  startAt: string
  tutorName: string
  subjectName: string
  bookingCutoff: string
}

const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric' })
const longDayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
const shortDateFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function tutorLabel(lesson: LessonAvailable) {
  return `${lesson.tutorFirstName} ${lesson.tutorLastName}`
}

// "lun alle 20:00": when a lesson's bookings close.
function cutoffLabel(iso: string) {
  const date = new Date(iso)
  return `${new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date)} alle ${timeFormat.format(date)}`
}

export default function StudentBookPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { profile, refresh } = useSession()

  const todayKey = React.useMemo(() => dayKeyOf(new Date()), [])
  const thisWeekOpen = React.useMemo(() => thisWeekBookable(new Date()), [])
  const thisMonday = mondayOf(todayKey)
  // Only one week is ever bookable: this one until Thursday 20:00, the next one from Saturday
  // noon, when its lessons are published. Before that the next week is empty.
  const weekOffset = thisWeekOpen ? 0 : 1
  const mondayKey = addDaysToKey(thisMonday, weekOffset * 7)
  const subjectId = searchParams.get('subject') ?? ''
  const dayKey = searchParams.get('day') ?? ''

  const [allSubjects, setAllSubjects] = React.useState<SubjectOption[]>([])
  // The summary remembers which week and subject it counts, so a stale one is never read as fresh.
  const [summary, setSummary] = React.useState<(Summary & { key: string }) | null>(null)
  const [summaryLoading, setSummaryLoading] = React.useState(true)
  const [lessons, setLessons] = React.useState<LessonAvailable[]>([])
  const [lessonsLoading, setLessonsLoading] = React.useState(false)

  const [target, setTarget] = React.useState<LessonAvailable | null>(null)
  const [topic, setTopic] = React.useState('')
  const [isBooking, setIsBooking] = React.useState(false)
  const [booked, setBooked] = React.useState<Booked | null>(null)
  const [upcoming, setUpcoming] = React.useState<MyLesson[]>([])

  const [requestSubjectId, setRequestSubjectId] = React.useState('')
  const [isRequesting, setIsRequesting] = React.useState(false)

  const setStep = React.useCallback(
    (next: { subject?: string, day?: string }, replace = false) => {
      const params = new URLSearchParams()
      const subject = next.subject ?? subjectId
      const day = next.day ?? ''
      if (subject) params.set('subject', subject)
      if (subject && day) params.set('day', day)
      const query = params.toString()
      const url = query ? `${pathname}?${query}` : pathname
      if (replace) router.replace(url, { scroll: false })
      else router.push(url, { scroll: false })
    },
    [pathname, router, subjectId]
  )

  // Every subject, for the request form: the steps only show subjects the student can book.
  React.useEffect(() => {
    let active = true
    fetch('/api/subjects')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active) setAllSubjects(extractPayloadArray<SubjectOption>(payload))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const loadSummary = React.useCallback(async () => {
    setSummaryLoading(true)
    try {
      const params = new URLSearchParams(weekRange(mondayKey))
      if (subjectId) params.set('subjectId', subjectId)
      const response = await fetch(`/api/lessons/available/summary?${params}`)
      if (!response.ok) throw new Error('Impossibile caricare le lezioni disponibili.')
      setSummary({ ...((await response.json()) as Summary), key: `${mondayKey}|${subjectId}` })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile caricare le lezioni disponibili.')
    } finally {
      setSummaryLoading(false)
    }
  }, [mondayKey, subjectId])

  const loadLessons = React.useCallback(async () => {
    if (!subjectId || !dayKey) {
      setLessons([])
      return
    }
    setLessonsLoading(true)
    try {
      const params = new URLSearchParams({ ...dayRange(dayKey), subjectId, limit: '200' })
      const response = await fetch(`/api/lessons/available?${params}`)
      if (!response.ok) throw new Error('Impossibile caricare le lezioni.')
      const items = extractPayloadArray<LessonAvailable>(await response.json())
      setLessons(items.toSorted((a, b) => a.startAt.localeCompare(b.startAt) || Number(b.canBook) - Number(a.canBook)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile caricare le lezioni.')
    } finally {
      setLessonsLoading(false)
    }
  }, [dayKey, subjectId])

  React.useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  React.useEffect(() => {
    void loadLessons()
  }, [loadLessons])

  const days = schoolDays(mondayKey)
  const current = summary?.key === `${mondayKey}|${subjectId}` ? summary : null
  const countsLoading = summaryLoading || !current
  const dayInfo = new Map(current?.days.map((entry) => [entry.day, entry]) ?? [])
  // Bookings close the evening before, so today and earlier can never be picked.
  const firstOpenDay = days.find((day) => day > todayKey && (dayInfo.get(day)?.count ?? 0) > 0 && !dayInfo.get(day)?.booked)

  // On a subject without a day, jump to the first day that has something to book.
  React.useEffect(() => {
    // Only the chosen subject's own counts say which day is the first worth opening.
    if (subjectId && !dayKey && current && firstOpenDay) {
      setStep({ subject: subjectId, day: firstOpenDay }, true)
    }
  }, [current, dayKey, firstOpenDay, setStep, subjectId])

  const bookableSubjects = current?.subjects.filter((subject) => subject.count > 0) ?? []
  const subjectName = allSubjects.find((subject) => subject.id === subjectId)?.name ?? ''
  const tokens = profile?.lessonTokens ?? null

  const openBooking = (lesson: LessonAvailable) => {
    setTarget(lesson)
    setTopic('')
    track('book_dialog_open')
  }

  const handleBooking = async () => {
    if (!target) return
    const trimmed = topic.trim()
    if (!trimmed) {
      toast.error('Scrivi l\'argomento della lezione.')
      return
    }
    setIsBooking(true)
    try {
      const response = await fetch(`/api/lessons/${target.id}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The student picked the subject first: an open lesson becomes a lesson of it.
        body: JSON.stringify({ topic: trimmed, subjectId })
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || 'Impossibile prenotare la lezione.')
      }
      setBooked({
        startAt: target.startAt,
        tutorName: `${target.tutorFirstName} ${target.tutorLastName}`,
        subjectName,
        bookingCutoff: target.bookingCutoff
      })
      setTarget(null)
      await refresh()
      const params = new URLSearchParams({ from: new Date().toISOString(), bookingStatus: 'confirmed', limit: '5' })
      const mine = await fetch(`/api/lessons/me?${params}`)
      setUpcoming(mine.ok ? extractPayloadArray<MyLesson>(await mine.json()) : [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile prenotare la lezione.')
      void loadLessons()
    } finally {
      setIsBooking(false)
    }
  }

  const handleSubjectRequest = async () => {
    if (!requestSubjectId) {
      toast.error('Seleziona una materia.')
      return
    }
    setIsRequesting(true)
    try {
      const response = await fetch('/api/subject-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: requestSubjectId })
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || 'Impossibile inviare la richiesta.')
      }
      toast.success('Richiesta inviata.')
      setRequestSubjectId('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile inviare la richiesta.')
    } finally {
      setIsRequesting(false)
    }
  }

  // A new booking starts again from step 1, at the top of the page.
  const startOver = () => {
    setBooked(null)
    router.push(pathname, { scroll: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const weekLabel = `${dayFormat.format(new Date(`${days[0]}T12:00:00`))} – ${shortDateFormat.format(new Date(`${days[4]}T12:00:00`))}`

  return (
    <main className='flex-1'>
      <div className='container mx-auto flex flex-col items-center px-4 py-10'>
        <div className='w-full max-w-3xl'>
          {/* Back follows the steps: from the lessons to the subjects, from the subjects home. */}
          <PageHeader
            title='Prenota lezione'
            backHref={booked || !subjectId ? '/student' : pathname}
            backLabel={booked || !subjectId ? 'Indietro' : 'Materie'}
            followFrom={false}
            actions={tokens !== null && <div><LessonHoursBadge tokens={tokens} className='text-sm' /></div>}
          />

          {/* Without hours nothing is bookable: say why instead of showing empty weeks. */}
          {hasNoHoursLeft(tokens) && !booked ? (
            <NoHoursCard />
          ) : booked ? (
            <BookedStep
              booked={booked}
              upcoming={upcoming}
              profile={profile}
              onAgain={startOver}
            />
          ) : (
            <>
              <StepHeader
                step={subjectId ? 2 : 1}
                title={subjectId ? subjectName || 'Materia' : 'Cosa vuoi studiare?'}
              />
              <p className='mt-2 text-sm text-muted-foreground'>
                {weekOffset === 0 ? 'Questa settimana' : 'Settimana prossima'} · {weekLabel}
              </p>

              {!subjectId ? (
                <SubjectStep
                  weekOffset={weekOffset}
                  loading={countsLoading}
                  subjects={bookableSubjects}
                  onPick={(id) => setStep({ subject: id, day: '' })}
                />
              ) : (
                <DayStep
                  days={days}
                  todayKey={todayKey}
                  dayKey={dayKey}
                  dayInfo={dayInfo}
                  summaryLoading={countsLoading}
                  lessons={lessons}
                  lessonsLoading={lessonsLoading}
                  subjectName={subjectName}
                  onPickDay={(day) => setStep({ subject: subjectId, day })}
                  onBook={openBooking}
                />
              )}

              {profile?.role === 'student' && !subjectId && (
                <Accordion type='single' collapsible className='mt-6 rounded-lg border bg-card px-4'>
                  <AccordionItem value='subject-request'>
                    <AccordionTrigger>Non trovi la materia che ti serve?</AccordionTrigger>
                    <AccordionContent className='space-y-3'>
                      <p className='text-sm text-muted-foreground'>
                        Segnalaci la materia: cercheremo un tutor, anche se non possiamo garantirlo.
                      </p>
                      <form
                        className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'
                        onSubmit={(event) => {
                          event.preventDefault()
                          void handleSubjectRequest()
                        }}
                      >
                        <Field className='gap-2'>
                          <FieldLabel htmlFor='subject-request'>Materia</FieldLabel>
                          <Select
                            value={requestSubjectId || 'none'}
                            onValueChange={(value) => setRequestSubjectId(value === 'none' ? '' : value)}
                          >
                            <SelectTrigger id='subject-request' className='w-full'>
                              <SelectValue placeholder='Seleziona una materia' />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='none'>Seleziona una materia</SelectItem>
                              {allSubjects.toSorted((a, b) => a.name.localeCompare(b.name, 'it')).map((subject) => (
                                <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Button type='submit' disabled={isRequesting}>
                          {isRequesting ? 'Invio...' : 'Segnala'}
                        </Button>
                      </form>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </>
          )}
        </div>
      </div>

      <AlertDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
      >
        <AlertDialogContent className='max-h-[calc(100vh-3rem)] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle className='flex items-center gap-2'>
              <StepNumber value={3} /> Conferma la prenotazione
            </AlertDialogTitle>
            <AlertDialogDescription>
              Controlla i dati e scrivi cosa vuoi fare a lezione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {target && (
            <ConfirmBody
              lesson={target}
              subjectName={subjectName}
              tokens={tokens}
              topic={topic}
              onTopic={setTopic}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Indietro</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBooking}
              onClick={(event) => {
                event.preventDefault()
                void handleBooking()
              }}
            >
              {isBooking ? 'Prenotazione...' : 'Prenota'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function StepNumber({ value }: { value: number }) {
  return (
    <span className='inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground'>
      {value}
    </span>
  )
}

function StepHeader({ step, title }: { step: number, title: string }) {
  return (
    <div className='mt-6 flex items-center gap-3'>
      <StepNumber value={step} />
      <h2 className='text-lg font-medium'>{title}</h2>
    </div>
  )
}

// Only subjects with something to book: a subject without lessons would be a dead end.
function SubjectStep({
  weekOffset,
  loading,
  subjects,
  onPick
}: {
  weekOffset: number
  loading: boolean
  subjects: Array<SubjectOption & { count: number }>
  onPick: (id: string) => void
}) {
  if (loading && subjects.length === 0) {
    return (
      <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3'>
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className='h-16' />)}
      </div>
    )
  }
  if (subjects.length === 0) {
    return (
      <EmptyState className='mt-4'>
        {weekOffset === 0
          ? 'In questa settimana non ci sono più lezioni che puoi prenotare. Quelle della settimana prossima vengono pubblicate il sabato a mezzogiorno.'
          : 'Le lezioni della settimana prossima non sono ancora disponibili: vengono pubblicate il sabato a mezzogiorno.'}
      </EmptyState>
    )
  }
  return (
    <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3'>
      {subjects.map((subject) => (
        <button
          key={subject.id}
          type='button'
          onClick={() => onPick(subject.id)}
          className='flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent'
        >
          <span className='font-medium'>{subject.name}</span>
          <span className='text-xs text-muted-foreground'>
            {subject.count === 1 ? '1 lezione' : `${subject.count} lezioni`}
          </span>
        </button>
      ))}
    </div>
  )
}

function DayStep({
  days,
  todayKey,
  dayKey,
  dayInfo,
  summaryLoading,
  lessons,
  lessonsLoading,
  subjectName,
  onPickDay,
  onBook
}: {
  days: string[]
  todayKey: string
  dayKey: string
  dayInfo: Map<string, { count: number, booked: boolean }>
  summaryLoading: boolean
  lessons: LessonAvailable[]
  lessonsLoading: boolean
  subjectName: string
  onPickDay: (day: string) => void
  onBook: (lesson: LessonAvailable) => void
}) {
  const selected = dayInfo.get(dayKey)
  const firstCutoff = lessons[0]?.bookingCutoff
  return (
    <div className='mt-4 space-y-4'>
      <div className='grid grid-cols-5 gap-2'>
        {days.map((day) => {
          const info = dayInfo.get(day)
          const past = day <= todayKey
          const count = info?.count ?? 0
          const disabled = past || info?.booked || count === 0
          const date = new Date(`${day}T12:00:00`)
          return (
            <button
              key={day}
              type='button'
              disabled={disabled}
              onClick={() => onPickDay(day)}
              aria-pressed={day === dayKey}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg border py-2 text-sm transition-colors',
                day === dayKey ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary',
                disabled && day !== dayKey && 'cursor-not-allowed opacity-50 hover:border-border'
              )}
            >
              <span className='capitalize'>{new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(date)}</span>
              <span className='text-lg font-medium leading-none'>{date.getDate()}</span>
              <span className='text-xs'>
                {summaryLoading
                  ? '…'
                  : info?.booked
                    ? <Check className='h-4 w-4' aria-label='Hai già una lezione' />
                    : past
                      ? 'chiuso'
                      : count}
              </span>
            </button>
          )
        })}
      </div>
      {days.some((day) => dayInfo.get(day)?.booked) && (
        <p className='text-sm text-muted-foreground'>
          <Check className='mr-1 inline h-4 w-4' />
          Nei giorni segnati hai già una lezione: se ne può prenotare una al giorno.
        </p>
      )}

      {!dayKey ? (
        summaryLoading
          ? <BlockSkeleton />
          : <EmptyState>{`In questa settimana non ci sono lezioni di ${subjectName} che puoi prenotare.`}</EmptyState>
      ) : lessonsLoading ? (
        <div className='space-y-2'>
          <Skeleton className='h-16' />
          <Skeleton className='h-16' />
        </div>
      ) : lessons.length === 0 ? (
        <Card>
          <CardContent className='py-6 text-sm text-muted-foreground'>
            {selected?.booked ? 'Questo giorno hai già una lezione.' : 'Nessuna lezione per questo giorno.'}
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-2'>
          <h3 className='text-sm font-medium text-muted-foreground'>
            {capitalize(longDayFormat.format(new Date(`${dayKey}T12:00:00`)))}
          </h3>
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} onBook={onBook} />
          ))}
          {firstCutoff && (
            <p className='flex items-center gap-2 pt-1 text-sm text-muted-foreground'>
              <Clock className='h-4 w-4' /> Prenotazioni aperte fino a {cutoffLabel(firstCutoff)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function LessonCard({ lesson, onBook }: { lesson: LessonAvailable, onBook: (lesson: LessonAvailable) => void }) {
  const seats = lessonBookableSeats(lesson)
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg border bg-card p-3', !lesson.canBook && 'opacity-60')}>
      <div className='min-w-0 font-medium'>
        {timeFormat.format(new Date(lesson.startAt))}
        <span className='font-normal'> · {tutorLabel(lesson)}</span>
        {lesson.tutorYear && <span className='text-sm text-muted-foreground'> {lesson.tutorYear}ª</span>}
      </div>
      <div className='flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center'>
        <Badge variant={seats > 1 ? 'secondary' : 'outline'}>
          {seats === 0 ? 'Completa' : seats === 1 ? '1 posto' : `${seats} posti`}
        </Badge>
        <Button size='sm' disabled={!lesson.canBook} onClick={() => onBook(lesson)}>
          Prenota
        </Button>
      </div>
    </div>
  )
}

function ConfirmBody({
  lesson,
  subjectName,
  tokens,
  topic,
  onTopic
}: {
  lesson: LessonAvailable
  subjectName: string
  tokens: number | null
  topic: string
  onTopic: (value: string) => void
}) {
  const start = new Date(lesson.startAt)
  const end = new Date(start.getTime() + lesson.durationMinutes * 60_000)
  return (
    <div className='space-y-4 text-sm'>
      <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted/50 p-3'>
        <dt className='text-muted-foreground'>Quando</dt>
        <dd className='text-right'>
          {capitalize(shortDateFormat.format(start))}, {timeFormat.format(start)}–{timeFormat.format(end)}
        </dd>
        <dt className='text-muted-foreground'>Tutor</dt>
        <dd className='text-right'>
          {lesson.tutorFirstName} {lesson.tutorLastName}{lesson.tutorYear ? `, ${lesson.tutorYear}ª` : ''}
        </dd>
        <dt className='text-muted-foreground'>Materia</dt>
        <dd className='text-right'>{subjectName}</dd>
        {tokens !== null && (
          <>
            <dt className='text-muted-foreground'>Ore di lezione rimanenti</dt>
            <dd className='text-right'>
              {tokens} → <span className='font-medium'>{Math.max(0, tokens - 1)}</span>
            </dd>
          </>
        )}
      </dl>

      <Field className='gap-2'>
        <FieldLabel htmlFor='booking-topic'>Di cosa hai bisogno?</FieldLabel>
        <Textarea
          id='booking-topic'
          value={topic}
          onChange={(event) => onTopic(capitalizeFirst(event.target.value))}
          placeholder='Equazioni di secondo grado...'
          maxLength={200}
          rows={3}
        />
        <div className='flex justify-between text-xs text-muted-foreground'>
          <span className='flex items-center gap-1'>
            <AlertTriangle className='h-3.5 w-3.5' /> Sii preciso: il tutor si prepara su questo
          </span>
          <span>{topic.length}/200</span>
        </div>
      </Field>
    </div>
  )
}

function BookedStep({
  booked,
  upcoming,
  profile,
  onAgain
}: {
  booked: Booked
  upcoming: MyLesson[]
  profile: ReturnType<typeof useSession>['profile']
  onAgain: () => void
}) {
  const start = new Date(booked.startAt)
  // A device that would miss the reminders gets the setup popup now, when it matters most.
  const pushSetup = usePushSetup(profile?.role)
  const prompted = React.useRef(false)
  React.useEffect(() => {
    if (pushSetup && !prompted.current) {
      prompted.current = true
      openPushSetup()
    }
  }, [pushSetup])
  return (
    <div className='mt-6 space-y-4'>
      <StepHeader step={4} title='Prenotata' />
      <Card>
        <CardContent className='space-y-4 py-6'>
          <div className='flex flex-col items-center gap-1 text-center'>
            <CircleCheck className='h-8 w-8 text-green-600' />
            <p className='text-lg font-medium'>
              Ci vediamo {longDayFormat.format(start)} alle {timeFormat.format(start)}
            </p>
            <p className='text-sm text-muted-foreground'>
              {booked.subjectName} con {booked.tutorName}, che riceve una notifica con il tuo argomento.
            </p>
          </div>
          <ul className='space-y-1.5 rounded-lg border p-3 text-sm'>
            <li className='flex items-center gap-2'>
              <Undo2 className='h-4 w-4 shrink-0' /> Annulli e recuperi l&apos;ora fino a {cutoffLabel(booked.bookingCutoff)}
            </li>
            <li className='flex items-center gap-2'>
              <AlertTriangle className='h-4 w-4 shrink-0' /> Dopo, l&apos;ora resta conteggiata
            </li>
            <li className='flex items-center gap-2'>
              <Bell className='h-4 w-4 shrink-0' /> Ti ricordiamo la lezione la sera prima e il giorno stesso
            </li>
          </ul>
        </CardContent>
      </Card>
      {upcoming.length > 0 && (
        <div className='space-y-2'>
          <h3 className='text-sm font-medium text-muted-foreground'>Le tue prossime lezioni</h3>
          {upcoming.map((lesson) => (
            <div key={lesson.id} className='flex items-center justify-between rounded-lg border bg-card p-3 text-sm'>
              <div>
                <div>
                  {capitalize(shortDateFormat.format(new Date(lesson.startAt)))} · {timeFormat.format(new Date(lesson.startAt))} · {lesson.subjectName}
                </div>
                <div className='text-muted-foreground'>{lesson.tutorFirstName} {lesson.tutorLastName}</div>
              </div>
              <Badge variant='secondary'>Confermata</Badge>
            </div>
          ))}
        </div>
      )}
      <div className='flex flex-col gap-3 sm:flex-row'>
        <Button size='lg' className='w-full sm:w-auto sm:flex-1' onClick={onAgain}>
          <Plus className='h-4 w-4' /> Prenota un&apos;altra lezione
        </Button>
        <Button asChild size='lg' variant='outline' className='w-full sm:w-auto sm:flex-1'>
          <Link href='/student/lessons'>
            <CalendarDays className='h-4 w-4' /> Le mie lezioni
          </Link>
        </Button>
      </div>
    </div>
  )
}
