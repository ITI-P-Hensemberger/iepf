'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
import { BackButton } from '@/components/back-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { extractPayloadArray } from '@/lib/backend-response'
import { formatItalianDate } from '@/lib/format-date'
import { useSession } from '@/lib/use-session'

type LessonAvailable = {
  id: string
  tutorId: string
  tutorFirstName: string
  tutorLastName: string
  subjectId: string
  subjectName: string
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyCapacity: number
  dailyOccupancy: number
  availableSeats: number
  status: string
  canBook: boolean
}

type Subject = {
  id: string
  name: string
}

type LessonFilters = {
  subjectId: string
  dayKey: string
  page: number
}

const defaultFilters: LessonFilters = {
  subjectId: '',
  dayKey: 'mon',
  page: 1
}

const pageSize = 20

const dayTabs = [
  { key: 'mon', label: 'Lun' },
  { key: 'tue', label: 'Mar' },
  { key: 'wed', label: 'Mer' },
  { key: 'thu', label: 'Gio' },
  { key: 'fri', label: 'Ven' }
]

function startOfDayIso(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next.toISOString()
}

function endOfDayIso(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next.toISOString()
}

function startOfWeekMonday(date: Date) {
  const next = new Date(date)
  const day = next.getDay()
  const diff = (day + 6) % 7
  next.setDate(next.getDate() - diff)
  next.setHours(0, 0, 0, 0)
  return next
}

function getDefaultWeekBaseDate() {
  const now = new Date()
  const weekday = now.getDay()
  if (weekday >= 1 && weekday <= 5) {
    return now
  }
  const offset = weekday === 6 ? 2 : 1
  const next = new Date(now)
  next.setDate(now.getDate() + offset)
  return next
}

function getDayKeyFromDate(date: Date) {
  const weekday = date.getDay()
  if (weekday >= 1 && weekday <= 5) {
    return dayTabs[weekday - 1].key
  }
  return 'mon'
}

function buildWeekDates(baseDate: Date) {
  const monday = startOfWeekMonday(baseDate)
  return new Map(
    dayTabs.map((day, index) => {
      const current = new Date(monday)
      current.setDate(monday.getDate() + index)
      return [day.key, current] as const
    })
  )
}

function extractTotal(payload: unknown, fallback: number) {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }
  const candidate = payload as Record<string, unknown>
  if (typeof candidate.total === 'number') {
    return candidate.total
  }
  if (candidate.data && typeof candidate.data === 'object') {
    const nested = candidate.data as Record<string, unknown>
    if (typeof nested.total === 'number') {
      return nested.total
    }
  }
  if (candidate.meta && typeof candidate.meta === 'object') {
    const meta = candidate.meta as Record<string, unknown>
    if (typeof meta.total === 'number') {
      return meta.total
    }
  }
  return fallback
}

function getNextAvailableDayKey(
  weekDates: Map<string, Date>,
  todayStart: Date
) {
  for (const day of dayTabs) {
    const date = weekDates.get(day.key)
    if (date && date.getTime() > todayStart.getTime()) {
      return day.key
    }
  }
  return null
}

export default function StudentBookPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()
  const { profile, refresh } = useSession()

  const baseDate = React.useMemo(() => getDefaultWeekBaseDate(), [])
  const weekDates = React.useMemo(() => buildWeekDates(baseDate), [baseDate])
  const todayStart = React.useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return now
  }, [])
  const isFriday = todayStart.getDay() === 5
  const nextAvailableDayKey = React.useMemo(
    () => getNextAvailableDayKey(weekDates, todayStart),
    [todayStart, weekDates]
  )

  const [filters, setFilters] = React.useState<LessonFilters>(defaultFilters)
  const [lessons, setLessons] = React.useState<LessonAvailable[]>([])
  const [total, setTotal] = React.useState(0)
  const [isLoading, setIsLoading] = React.useState(true)
  const [subjects, setSubjects] = React.useState<Subject[]>([])
  const [subjectsLoading, setSubjectsLoading] = React.useState(true)

  const [bookingOpen, setBookingOpen] = React.useState(false)
  const [bookingTarget, setBookingTarget] =
    React.useState<LessonAvailable | null>(null)
  const [bookingTopic, setBookingTopic] = React.useState('')
  const [isBooking, setIsBooking] = React.useState(false)

  const updateParams = React.useCallback(
    (updates: Partial<LessonFilters>, base: LessonFilters = filters) => {
      const params = new URLSearchParams(searchParamsString)
      const nextSubject = updates.subjectId ?? base.subjectId
      const nextDay = updates.dayKey ?? base.dayKey
      const nextPage = updates.page ?? 1

      if (nextSubject) {
        params.set('lessonSubject', nextSubject)
      } else {
        params.delete('lessonSubject')
      }

      if (nextDay) {
        params.set('day', nextDay)
      } else {
        params.delete('day')
      }

      if (nextPage > 1) {
        params.set('lessonPage', String(nextPage))
      } else {
        params.delete('lessonPage')
      }

      const nextParams = params.toString()
      const url = nextParams ? `${pathname}?${nextParams}` : pathname
      router.replace(url, { scroll: false })
    },
    [filters, pathname, router, searchParamsString]
  )

  const parsePage = React.useCallback(
    (key: string) => {
      const raw = searchParams.get(key)
      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || parsed < 1) {
        return 1
      }
      return Math.floor(parsed)
    },
    [searchParams]
  )

  const currentFilters = React.useMemo(() => {
    return {
      subjectId: searchParams.get('lessonSubject') ?? '',
      dayKey: searchParams.get('day') ?? getDayKeyFromDate(baseDate),
      page: parsePage('lessonPage')
    }
  }, [baseDate, parsePage, searchParams])

  React.useEffect(() => {
    const tabDate = weekDates.get(currentFilters.dayKey)
    const isPastOrToday =
      tabDate?.getTime() !== undefined &&
      tabDate.getTime() <= todayStart.getTime()
    const nextDayKey = nextAvailableDayKey
    const safeDayKey =
      isPastOrToday && nextDayKey ? nextDayKey : currentFilters.dayKey

    if (isPastOrToday && safeDayKey !== currentFilters.dayKey) {
      const params = new URLSearchParams(searchParamsString)
      params.set('day', safeDayKey)
      params.set('lessonPage', '1')
      const url = `${pathname}?${params.toString()}`
      router.replace(url, { scroll: false })
      return
    }

    setFilters({
      subjectId: currentFilters.subjectId,
      dayKey: safeDayKey,
      page: currentFilters.page
    })
  }, [
    currentFilters,
    nextAvailableDayKey,
    pathname,
    router,
    searchParamsString,
    todayStart,
    weekDates
  ])

  const subjectMap = React.useMemo(() => {
    const map = new Map<string, Subject>()
    subjects.forEach((subject) => map.set(subject.id, subject))
    return map
  }, [subjects])

  const sortedSubjects = React.useMemo(() => {
    return [...subjects].sort((a, b) => a.name.localeCompare(b.name))
  }, [subjects])

  const loadLessons = React.useCallback(async () => {
    setIsLoading(true)
    const params = new URLSearchParams()
    if (currentFilters.subjectId) {
      params.set('subjectId', currentFilters.subjectId)
    }
    const selectedDate = weekDates.get(currentFilters.dayKey)
    if (selectedDate) {
      params.set('from', startOfDayIso(selectedDate))
      params.set('to', endOfDayIso(selectedDate))
    }
    params.set('sortBy', 'startAt')
    params.set('sortDir', 'asc')
    params.set('limit', String(pageSize))
    params.set('offset', String((currentFilters.page - 1) * pageSize))

    try {
      const response = await fetch(
        `/api/lessons/available?${params.toString()}`
      )
      if (!response.ok) {
        throw new Error('Impossibile caricare le lezioni disponibili.')
      }
      const payload = await response.json()
      const items = extractPayloadArray<LessonAvailable>(payload)
      const totalValue = extractTotal(payload, items.length)
      const sorted = [...items].sort((a, b) => {
        if (a.canBook !== b.canBook) {
          return a.canBook ? -1 : 1
        }
        const aTime = Date.parse(a.startAt)
        const bTime = Date.parse(b.startAt)
        if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
        return aTime - bTime
      })
      setLessons(sorted)
      setTotal(totalValue)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile caricare le lezioni disponibili.'
      )
      setLessons([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [currentFilters, weekDates])

  React.useEffect(() => {
    let isMounted = true

    async function loadSubjects() {
      setSubjectsLoading(true)

      try {
        const response = await fetch('/api/subjects')
        if (!response.ok) {
          throw new Error('Impossibile caricare le materie.')
        }
        const payload = await response.json()
        const items = extractPayloadArray<Subject>(payload)
        if (isMounted) {
          setSubjects(items)
        }
      } catch (err) {
        if (isMounted) {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Impossibile caricare le materie.'
          )
        }
      } finally {
        if (isMounted) {
          setSubjectsLoading(false)
        }
      }
    }

    void loadSubjects()

    return () => {
      isMounted = false
    }
  }, [])

  React.useEffect(() => {
    void loadLessons()
  }, [loadLessons])

  React.useEffect(() => {
    if (!searchParams.has('day')) {
      const params = new URLSearchParams(searchParamsString)
      params.set('day', 'mon')
      const url = `${pathname}?${params.toString()}`
      router.replace(url, { scroll: false })
    }
  }, [pathname, router, searchParams, searchParamsString])

  const handleApplyFilters = React.useCallback(() => {
    updateParams({ page: 1 }, filters)
  }, [filters, updateParams])

  const handleClearFilters = React.useCallback(() => {
    setFilters({
      subjectId: '',
      dayKey: filters.dayKey,
      page: 1
    })
    updateParams(
      {
        subjectId: '',
        page: 1
      },
      { ...filters, subjectId: '' }
    )
  }, [filters, updateParams])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleBooking = React.useCallback(async () => {
    if (!bookingTarget) return
    const trimmed = bookingTopic.trim()
    if (!trimmed) {
      toast.error('Inserisci un topic.')
      return
    }
    if (trimmed.length > 200) {
      toast.error('Il topic deve avere massimo 200 caratteri.')
      return
    }
    setIsBooking(true)
    try {
      const response = await fetch(`/api/lessons/${bookingTarget.id}/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ topic: trimmed })
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || 'Impossibile prenotare la lezione.')
      }
      toast.success('Prenotazione completata.')
      setBookingOpen(false)
      setBookingTarget(null)
      setBookingTopic('')
      await refresh()
      await loadLessons()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile prenotare la lezione.'
      )
    } finally {
      setIsBooking(false)
    }
  }, [bookingTarget, bookingTopic, loadLessons, refresh])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <div className='mb-6 self-start'>
            <BackButton />
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Prenota lezione</h1>
          </div>

          {isFriday && !nextAvailableDayKey ? (
            <Card className='mt-6'>
              <CardHeader>
                <CardTitle>Lezioni della prossima settimana</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-sm text-muted-foreground'>
                  Le lezioni della prossima settimana verranno rese disponibili
                  a breve. Torna domani per visualizzarle e prenotarle.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className='mt-6 flex flex-col gap-4'>
            <div className='flex flex-wrap items-center gap-3'>
              <Tabs
                value={filters.dayKey}
                onValueChange={(value) => {
                  setFilters((prev) => ({
                    ...prev,
                    dayKey: value,
                    page: 1
                  }))
                  updateParams({ dayKey: value, page: 1 }, filters)
                }}
              >
                <TabsList>
                  {dayTabs.map((day) => {
                    const tabDate = weekDates.get(day.key)
                    const isPastOrToday =
                      tabDate?.getTime() !== undefined &&
                      tabDate.getTime() <= todayStart.getTime()
                    return (
                      <TabsTrigger
                        key={day.key}
                        value={day.key}
                        disabled={isPastOrToday}
                      >
                        {day.label}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </Tabs>
              {profile?.role === 'student' && (
                <Badge variant='secondary'>
                  Lezioni rimanenti: {profile.lessonTokens ?? '-'}
                </Badge>
              )}
            </div>

                <form
                  className='rounded-lg border bg-card p-4 shadow-sm'
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleApplyFilters()
                  }}
                >
                  <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
                    <Field className='gap-2'>
                      <FieldLabel>Materia</FieldLabel>
                      <Select
                        value={filters.subjectId || 'all'}
                        onValueChange={(value) =>
                          setFilters((prev) => ({
                            ...prev,
                            subjectId: value === 'all' ? '' : value
                          }))
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue
                            placeholder={
                              subjectsLoading
                                ? 'Caricamento...'
                                : 'Tutte le materie'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='all'>Tutte le materie</SelectItem>
                          {sortedSubjects.map((subject) => (
                            <SelectItem key={subject.id} value={subject.id}>
                              {subject.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className='mt-4 flex flex-col gap-2 pt-2 sm:pt-0 sm:flex-row sm:items-end sm:justify-end'>
                    <Button variant='outline' type='button' onClick={handleClearFilters}>
                      Reset filtri
                    </Button>
                    <Button type='submit'>Applica filtri</Button>
                  </div>
                </form>
              </div>

              <div className='mt-6 rounded-lg border'>
                <Table>
                  <TableHeader className='bg-muted/50'>
                    <TableRow>
                  <TableHead className='whitespace-nowrap'>Data e ora</TableHead>
                      <TableHead>Materia</TableHead>
                      <TableHead>Tutor</TableHead>
                      <TableHead>Posti disponibili</TableHead>
                      <TableHead className='w-32'>
                        <span className='sr-only'>Azioni</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground'
                        >
                          Caricamento...
                        </TableCell>
                      </TableRow>
                    ) : lessons.length ? (
                      lessons.map((lesson) => {
                        const subject = subjectMap.get(lesson.subjectId)
                        return (
                          <TableRow
                            key={lesson.id}
                            className={
                              !lesson.canBook ? 'opacity-60' : undefined
                            }
                          >
                            <TableCell>
                              {formatItalianDate(lesson.startAt)}
                            </TableCell>
                            <TableCell>
                              {subjectsLoading
                                ? 'Caricamento...'
                                : (subject?.name ?? lesson.subjectName ?? '-')}
                            </TableCell>
                            <TableCell>
                              {lesson.tutorLastName} {lesson.tutorFirstName}
                            </TableCell>
                            <TableCell>
                              {Math.max(
                                0,
                                lesson.availableSeats - lesson.dailyOccupancy
                              ) > 0
                                ? Math.max(
                                    0,
                                    lesson.availableSeats -
                                      lesson.dailyOccupancy
                                  )
                                : '-'}
                            </TableCell>
                            <TableCell className='text-right'>
                              <Button
                                size='sm'
                                variant='default'
                                disabled={!lesson.canBook}
                                onClick={() => {
                                  setBookingTarget(lesson)
                                  setBookingTopic('')
                                  setBookingOpen(true)
                                }}
                              >
                                Prenota
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground'
                        >
                          Nessuna lezione disponibile.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {!isFriday || nextAvailableDayKey ? (
            <div className='mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
              <span>
                Pagina {currentFilters.page} di {totalPages} · Totale {total}
              </span>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    updateParams({ page: currentFilters.page - 1 }, filters)
                  }
                  disabled={currentFilters.page <= 1 || isLoading}
                >
                  Precedente
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    updateParams({ page: currentFilters.page + 1 }, filters)
                  }
                  disabled={currentFilters.page >= totalPages || isLoading}
                >
                  Successiva
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <AlertDialog
        open={bookingOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBookingOpen(false)
            setBookingTarget(null)
            setBookingTopic('')
            return
          }
          setBookingOpen(true)
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Prenota lezione</AlertDialogTitle>
            <AlertDialogDescription>
              Confermi la prenotazione della lezione selezionata?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bookingTarget && (
            <div className='space-y-2 text-sm text-muted-foreground'>
              <div>Data: {formatItalianDate(bookingTarget.startAt)}</div>
              <div>Materia: {bookingTarget.subjectName || '-'}</div>
              <div>
                Tutor: {bookingTarget.tutorLastName}{' '}
                {bookingTarget.tutorFirstName}
              </div>
            </div>
          )}
          <div className='space-y-4'>
            <label className='text-sm font-medium text-muted-foreground'>
              Topic (obbligatorio)
            </label>
            <p className='flex items-start gap-2 mt-1 text-xs font-semibold text-muted-foreground'>
              <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
              <span>
                Sii preciso nel descrivere l&apos;argomento da trattare durante
                la lezione. In caso contrario la lezione potrebbe venire
                annullata.
              </span>
            </p>
            <Textarea
              value={bookingTopic}
              onChange={(event) => setBookingTopic(event.target.value)}
              placeholder='Inserisci il topic della lezione...'
              maxLength={200}
              rows={4}
            />
            <div className='text-xs text-muted-foreground'>
              {bookingTopic.length}/200
            </div>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleBooking()
              }}
              disabled={isBooking}
            >
              {isBooking ? 'Prenotazione...' : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
