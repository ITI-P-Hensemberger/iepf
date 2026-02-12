'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarIcon, ExternalLink, MessageSquare } from 'lucide-react'

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
import { Calendar } from '@/components/ui/calendar'
import { Field, FieldLabel } from '@/components/ui/field'
import { BackButton } from '@/components/back-button'
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
import { Textarea } from '@/components/ui/textarea'

import { format } from 'date-fns'
import { toast } from 'sonner'

import { formatItalianDate } from '@/lib/format-date'
import { type DateRange } from 'react-day-picker'

import { extractPayloadArray } from '@/lib/backend-response'
import { useSession } from '@/lib/use-session'

const pageSize = 20

type LessonBooking = {
  id: string
  tutorId: string
  tutorFirstName: string
  tutorLastName: string
  tutorEmail?: string | null
  subjectId: string
  subjectName: string
  startAt: string
  durationMinutes: number
  lessonStatus: string
  bookingId: string
  bookingStatus: string
  topic: string
  countsForStudent: boolean
  studentPresence: boolean | null
  studentPresenceAt: string | null
}

type Subject = {
  id: string
  name: string
}

type Feedback = {
  id: string
  lessonId: string
  bookingId: string
  rating: number
  text?: string | null
}

type LessonFilters = {
  subjectId: string
  status: string
  dateRange?: DateRange
}

const defaultFilters: LessonFilters = {
  subjectId: '',
  status: '',
  dateRange: undefined
}

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

function parseDateParam(value: string | null) {
  if (!value) {
    return undefined
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }
  return parsed
}

function formatStatusLabel(status?: string | null) {
  if (!status) {
    return '-'
  }
  const normalized = status.toLowerCase()
  const mapping: Record<string, string> = {
    confirmed: 'Confermata',
    canceled: 'Annullata',
    cancelled: 'Annullata',
    scheduled: 'Programmata'
  }
  return mapping[normalized] ?? 'Programmata'
}

function statusVariant(
  status?: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!status) {
    return 'secondary'
  }
  const normalized = status.toLowerCase()
  if (normalized === 'canceled' || normalized === 'cancelled') {
    return 'destructive'
  }
  if (normalized === 'confirmed') {
    return 'default'
  }
  return 'secondary'
}

export default function StudentLessonsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()
  const { profile } = useSession()

  const [filters, setFilters] = React.useState<LessonFilters>(defaultFilters)
  const [lessons, setLessons] = React.useState<LessonBooking[]>([])
  const [total, setTotal] = React.useState(0)
  const [isLoading, setIsLoading] = React.useState(true)
  const [subjects, setSubjects] = React.useState<Subject[]>([])
  const [subjectsLoading, setSubjectsLoading] = React.useState(true)

  const [isFilterDateDialogOpen, setIsFilterDateDialogOpen] =
    React.useState(false)

  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [feedbackTarget, setFeedbackTarget] =
    React.useState<LessonBooking | null>(null)
  const [feedbackRating, setFeedbackRating] = React.useState<number>(5)
  const [feedbackText, setFeedbackText] = React.useState('')
  const [feedbackReadonly, setFeedbackReadonly] = React.useState(false)
  const [feedbackByBooking, setFeedbackByBooking] = React.useState<
    Map<string, Feedback>
  >(new Map())
  const [isSavingFeedback, setIsSavingFeedback] = React.useState(false)
  const [topicDialogOpen, setTopicDialogOpen] = React.useState(false)
  const [topicDialogValue, setTopicDialogValue] = React.useState('')
  const [topicDialogTutor, setTopicDialogTutor] = React.useState('')
  const [topicDialogDate, setTopicDialogDate] = React.useState('')
  const [topicDialogSubject, setTopicDialogSubject] = React.useState('')

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
    const fromParam = parseDateParam(searchParams.get('lessonFrom'))
    const toParam = parseDateParam(searchParams.get('lessonTo'))
    return {
      subjectId: searchParams.get('lessonSubject') ?? '',
      status: searchParams.get('lessonStatus') ?? '',
      dateRange:
        fromParam || toParam
          ? {
              from: fromParam,
              to: toParam
            }
          : undefined,
      page: parsePage('lessonPage')
    }
  }, [parsePage, searchParams])

  React.useEffect(() => {
    setFilters({
      subjectId: currentFilters.subjectId,
      status: currentFilters.status,
      dateRange: currentFilters.dateRange
    })
  }, [currentFilters])

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
    if (currentFilters.status) {
      params.set('bookingStatus', currentFilters.status)
    }
    if (currentFilters.dateRange?.from) {
      params.set('from', startOfDayIso(currentFilters.dateRange.from))
    }
    if (currentFilters.dateRange?.to) {
      params.set('to', endOfDayIso(currentFilters.dateRange.to))
    }
    params.set('sortBy', 'startAt')
    params.set('sortDir', 'desc')
    params.set('limit', '200')
    params.set('offset', '0')

    try {
      const response = await fetch(`/api/lessons/me?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare le lezioni.')
      }
      const payload = await response.json()
      const items = extractPayloadArray<LessonBooking>(payload)
      setLessons(items)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile caricare le lezioni.'
      )
      setLessons([])
    } finally {
      setIsLoading(false)
    }
  }, [currentFilters])

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

  const loadFeedback = React.useCallback(async () => {
    const params = new URLSearchParams()
    if (currentFilters.dateRange?.from) {
      params.set('from', startOfDayIso(currentFilters.dateRange.from))
    }
    if (currentFilters.dateRange?.to) {
      params.set('to', endOfDayIso(currentFilters.dateRange.to))
    }
    params.set('limit', '200')
    params.set('offset', '0')

    try {
      const response = await fetch(`/api/feedback/me?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare i feedback.')
      }
      const payload = await response.json()
      const items = extractPayloadArray<Feedback>(payload)
      setFeedbackByBooking(new Map(items.map((item) => [item.bookingId, item])))
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile caricare i feedback.'
      )
      setFeedbackByBooking(new Map())
    }
  }, [currentFilters.dateRange?.from, currentFilters.dateRange?.to])

  React.useEffect(() => {
    void loadLessons()
    void loadFeedback()
  }, [loadFeedback, loadLessons])

  const appliedFilters = React.useMemo(
    () => ({
      subjectId: currentFilters.subjectId,
      status: currentFilters.status,
      dateRange: currentFilters.dateRange
    }),
    [currentFilters]
  )

  const filteredLessons = React.useMemo(() => {
    return lessons.filter((lesson) => {
      if (
        appliedFilters.subjectId &&
        lesson.subjectId !== appliedFilters.subjectId
      ) {
        return false
      }
      if (
        appliedFilters.status &&
        lesson.bookingStatus !== appliedFilters.status
      ) {
        return false
      }
      return true
    })
  }, [appliedFilters, lessons])

  React.useEffect(() => {
    setTotal(filteredLessons.length)
  }, [filteredLessons])

  const updateParams = React.useCallback(
    (
      updates: Partial<LessonFilters> & { page?: number },
      base: LessonFilters = filters
    ) => {
      const params = new URLSearchParams(searchParamsString)
      const nextSubject = updates.subjectId ?? base.subjectId
      const nextStatus = updates.status ?? base.status
      const nextRange = updates.dateRange ?? base.dateRange
      const nextPage = updates.page ?? 1

      if (nextSubject) {
        params.set('lessonSubject', nextSubject)
      } else {
        params.delete('lessonSubject')
      }

      if (nextStatus) {
        params.set('lessonStatus', nextStatus)
      } else {
        params.delete('lessonStatus')
      }

      if (nextRange?.from) {
        params.set('lessonFrom', startOfDayIso(nextRange.from))
      } else {
        params.delete('lessonFrom')
      }

      if (nextRange?.to) {
        params.set('lessonTo', endOfDayIso(nextRange.to))
      } else {
        params.delete('lessonTo')
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

  const handleApplyFilters = React.useCallback(() => {
    updateParams({ page: 1 }, filters)
  }, [filters, updateParams])

  const handleClearFilters = React.useCallback(() => {
    setFilters(defaultFilters)
    updateParams(
      {
        subjectId: '',
        status: '',
        dateRange: undefined,
        page: 1
      },
      defaultFilters
    )
  }, [updateParams])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageStart = (currentFilters.page - 1) * pageSize
  const pageItems = filteredLessons.slice(pageStart, pageStart + pageSize)

  const handleSaveFeedback = React.useCallback(async () => {
    if (!feedbackTarget || feedbackReadonly) return
    const trimmed = feedbackText.trim()
    if (!trimmed) {
      toast.error('Inserisci un feedback.')
      return
    }
    if (trimmed.length > 1000) {
      toast.error('Il feedback deve avere massimo 1000 caratteri.')
      return
    }
    if (
      !Number.isFinite(feedbackRating) ||
      feedbackRating < 1 ||
      feedbackRating > 5
    ) {
      toast.error('Seleziona un rating valido.')
      return
    }
    setIsSavingFeedback(true)
    try {
      const response = await fetch(
        `/api/lessons/${feedbackTarget.id}/feedback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            bookingId: feedbackTarget.bookingId,
            rating: feedbackRating,
            text: trimmed
          })
        }
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || 'Impossibile salvare il feedback.')
      }
      const saved = (await response.json().catch(() => null)) as Feedback | null
      if (saved?.bookingId) {
        setFeedbackByBooking((prev) => {
          const next = new Map(prev)
          next.set(saved.bookingId, saved)
          return next
        })
      }
      toast.success('Feedback salvato.')
      setFeedbackOpen(false)
      setFeedbackTarget(null)
      setFeedbackText('')
      setFeedbackRating(5)
      setFeedbackReadonly(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile salvare il feedback.'
      )
    } finally {
      setIsSavingFeedback(false)
    }
  }, [feedbackRating, feedbackReadonly, feedbackTarget, feedbackText])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <div className='mb-6 self-start'>
            <BackButton />
          </div>
          <div className='flex gap-2 flex-row items-center justify-between'>
            <h1 className='text-2xl'>Lezioni</h1>
            {profile?.role === 'student' && (
              <Badge variant='secondary'>
                Lezioni rimanenti: {profile.lessonTokens ?? '-'}
              </Badge>
            )}
          </div>

          <form
            className='mt-6 rounded-lg border bg-card p-4 shadow-sm'
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
                        subjectsLoading ? 'Caricamento...' : 'Tutte le materie'
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
              <Field className='gap-2'>
                <FieldLabel>Stato</FieldLabel>
                <Select
                  value={filters.status || 'all'}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      status: value === 'all' ? '' : value
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='Tutti gli stati' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>Tutti gli stati</SelectItem>
                    <SelectItem value='confirmed'>Confermata</SelectItem>
                    <SelectItem value='scheduled'>Programmata</SelectItem>
                    <SelectItem value='canceled'>Annullata</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field className='gap-2'>
                <FieldLabel htmlFor='lesson-date-range'>Periodo</FieldLabel>
                <Button
                  variant='outline'
                  id='lesson-date-range'
                  className='justify-start px-2.5 font-normal'
                  type='button'
                  onClick={() => setIsFilterDateDialogOpen(true)}
                >
                  <CalendarIcon className='mr-2 h-4 w-4' />
                  {filters.dateRange?.from ? (
                    filters.dateRange.to ? (
                      <>
                        {format(filters.dateRange.from, 'dd/MM/yyyy')} -{' '}
                        {format(filters.dateRange.to, 'dd/MM/yyyy')}
                      </>
                    ) : (
                      format(filters.dateRange.from, 'dd/MM/yyyy')
                    )
                  ) : (
                    <span>Seleziona periodo</span>
                  )}
                </Button>
              </Field>
            </div>
            <div className='mt-4 flex flex-col gap-2 pt-2 sm:pt-0 sm:flex-row sm:items-end sm:justify-end'>
              <Button variant='outline' type='button' onClick={handleClearFilters}>
                Reset filtri
              </Button>
              <Button type='submit'>Applica filtri</Button>
            </div>
          </form>

          <div className='mt-6 rounded-lg border'>
            <Table>
              <TableHeader className='bg-muted/50'>
                <TableRow>
                  <TableHead className='whitespace-nowrap'>Data e ora</TableHead>
                  <TableHead>Materia</TableHead>
                  <TableHead>Argomento</TableHead>
                  <TableHead>Tutor</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className='w-12'>
                    <span className='sr-only'>Feedback</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className='text-muted-foreground'>
                      Caricamento...
                    </TableCell>
                  </TableRow>
                ) : pageItems.length ? (
                  pageItems.map((lesson) => {
                    const subject = subjectMap.get(lesson.subjectId)
                    const statusValue =
                      lesson.bookingStatus || lesson.lessonStatus
                    const normalizedStatus = statusValue?.toLowerCase() ?? ''
                    const isConfirmed = normalizedStatus === 'confirmed'
                    const startTime = Date.parse(lesson.startAt)
                    const feedbackReady =
                      Number.isFinite(startTime) &&
                      Date.now() >= startTime + 60 * 60 * 1000
                    const canFeedback =
                      isConfirmed &&
                      lesson.studentPresence === true &&
                      feedbackReady
                    const tutorLabel = `${lesson.tutorLastName} ${lesson.tutorFirstName}`.trim()
                    const topicValue = lesson.topic?.trim()
                    return (
                      <TableRow key={lesson.bookingId}>
                        <TableCell>
                          {formatItalianDate(lesson.startAt)}
                        </TableCell>
                        <TableCell>
                          {subjectsLoading
                            ? 'Caricamento...'
                            : (subject?.name ?? lesson.subjectName ?? '-')}
                        </TableCell>
                        <TableCell>
                          {topicValue ? (
                            <Button
                              variant='ghost'
                              size='sm'
                              className='h-auto w-full justify-start gap-2 px-0 text-left text-sm font-normal'
                              onClick={() => {
                                setTopicDialogValue(topicValue)
                                setTopicDialogTutor(tutorLabel || 'Tutor')
                                setTopicDialogDate(
                                  formatItalianDate(lesson.startAt)
                                )
                                setTopicDialogSubject(
                                  subject?.name ?? lesson.subjectName ?? '-'
                                )
                                setTopicDialogOpen(true)
                              }}
                            >
                              <span>
                                {topicValue.length > 15
                                  ? `${topicValue.slice(0, 15)}...`
                                  : topicValue}
                              </span>
                              <ExternalLink className='h-4 w-4 shrink-0 text-muted-foreground' />
                            </Button>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{tutorLabel}</TableCell>
                        <TableCell>
                          {isConfirmed && lesson.studentPresence !== null ? (
                            <Badge
                              variant={
                                lesson.studentPresence ? 'success' : 'destructive'
                              }
                            >
                              {lesson.studentPresence ? 'Presente' : 'Assente'}
                            </Badge>
                          ) : (
                            <Badge
                              variant={
                                normalizedStatus === 'canceled' ||
                                normalizedStatus === 'cancelled'
                                  ? 'warning'
                                  : statusVariant(statusValue)
                              }
                            >
                              {formatStatusLabel(statusValue)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className='text-right'>
                          {canFeedback ? (
                            <Button
                              variant='ghost'
                              size='sm'
                              className='h-7 gap-2 px-2'
                              aria-label='Lascia feedback'
                              onClick={() => {
                                const existing = feedbackByBooking.get(
                                  lesson.bookingId
                                )
                                setFeedbackTarget(lesson)
                                setFeedbackRating(existing?.rating ?? 5)
                                setFeedbackText(existing?.text ?? '')
                                setFeedbackReadonly(Boolean(existing))
                                setFeedbackOpen(true)
                              }}
                            >
                              <MessageSquare className='h-4 w-4' />
                              <span>
                                {feedbackByBooking.has(lesson.bookingId)
                                  ? 'Vedi feedback'
                                  : 'Lascia feedback'}
                              </span>
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className='text-muted-foreground'>
                      Nessuna lezione trovata.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className='mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
            <span>
              Pagina {currentFilters.page} di {totalPages} · Totale {total}
            </span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  updateParams(
                    { page: currentFilters.page - 1 },
                    appliedFilters
                  )
                }
                disabled={currentFilters.page <= 1 || isLoading}
              >
                Precedente
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  updateParams(
                    { page: currentFilters.page + 1 },
                    appliedFilters
                  )
                }
                disabled={currentFilters.page >= totalPages || isLoading}
              >
                Successiva
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        open={isFilterDateDialogOpen}
        onOpenChange={setIsFilterDateDialogOpen}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Seleziona periodo</AlertDialogTitle>
            <AlertDialogDescription>
              Scegli l&apos;intervallo di date per filtrare le lezioni.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='flex justify-center'>
              <Calendar
                mode='range'
                defaultMonth={filters.dateRange?.from ?? new Date()}
                selected={filters.dateRange}
                onSelect={(range) =>
                  setFilters((prev) => ({
                    ...prev,
                    dateRange: range
                  }))
                }
                numberOfMonths={1}
              />
            </div>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                setIsFilterDateDialogOpen(false)
              }}
            >
              Applica
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={topicDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTopicDialogOpen(false)
            setTopicDialogValue('')
            setTopicDialogTutor('')
            setTopicDialogDate('')
            setTopicDialogSubject('')
            return
          }
          setTopicDialogOpen(true)
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Argomento</AlertDialogTitle>
          </AlertDialogHeader>
          <div className='space-y-3'>
            <div className='text-sm text-muted-foreground'>
              <div>Tutor: {topicDialogTutor || '—'}</div>
              <div>Data: {topicDialogDate || '—'}</div>
              <div>Materia: {topicDialogSubject || '—'}</div>
            </div>
            <div className='rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap'>
              {topicDialogValue || '-'}
            </div>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={feedbackOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFeedbackOpen(false)
            setFeedbackTarget(null)
            setFeedbackRating(5)
            setFeedbackText('')
            setFeedbackReadonly(false)
            return
          }
          setFeedbackOpen(true)
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Feedback</AlertDialogTitle>
            <AlertDialogDescription>
              {feedbackReadonly
                ? 'Hai già inviato un feedback per questa lezione.'
                : 'Inserisci il tuo feedback per la lezione selezionata.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-muted-foreground'>
                Rating
              </label>
              <Select
                value={String(feedbackRating)}
                onValueChange={(value) => {
                  const parsed = Number(value)
                  if (Number.isFinite(parsed)) {
                    setFeedbackRating(parsed)
                  }
                }}
                disabled={feedbackReadonly}
              >
                <SelectTrigger className='w-28'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='1'>1</SelectItem>
                  <SelectItem value='2'>2</SelectItem>
                  <SelectItem value='3'>3</SelectItem>
                  <SelectItem value='4'>4</SelectItem>
                  <SelectItem value='5'>5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              placeholder='Scrivi il feedback...'
              maxLength={1000}
              rows={5}
              readOnly={feedbackReadonly}
            />
            <div className='text-xs text-muted-foreground'>
              {feedbackText.length}/1000
            </div>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            {!feedbackReadonly && (
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  void handleSaveFeedback()
                }}
                disabled={isSavingFeedback}
              >
                {isSavingFeedback ? 'Salvataggio...' : 'Salva'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
