'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { extractPayloadArray } from '@/lib/backend-response'
import { formatItalianDate } from '@/lib/format-date'
import { BackButton } from '@/components/back-button'
import { ExternalLink, Mail, MessageSquare, Save } from 'lucide-react'
import { toast } from 'sonner'

type Lesson = {
  id: string
  tutorId: string
  subjectId: string
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyCapacity?: number | null
  dailyAvailability?: number | null
  dailyOccupancy?: number | null
  availableSeats: number
  status: string
}

type Booking = {
  id: string
  studentId: string
  topic?: string | null
  studentPresence: boolean | null
  countsForStudent: boolean | null
  status: string
}

type Student = {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  year?: number | null
  sectionName?: string | null
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

const statusLabels: Record<string, string> = {
  confirmed: 'Confermata',
  canceled: 'Annullata',
  cancelled: 'Annullata',
  scheduled: 'Programmata'
}

function formatStatusLabel(status?: string | null) {
  if (!status) return '-'
  return statusLabels[status.toLowerCase()] ?? 'Programmata'
}

function statusVariant(
  status?: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!status) return 'secondary'
  const normalized = status.toLowerCase()
  if (normalized === 'canceled' || normalized === 'cancelled') {
    return 'destructive'
  }
  if (normalized === 'confirmed') {
    return 'default'
  }
  return 'secondary'
}

function isCanceledStatus(status?: string | null) {
  if (!status) return false
  const normalized = status.toLowerCase()
  return normalized === 'canceled' || normalized === 'cancelled'
}

function isCanceledBooking(status?: string | null) {
  if (!status) return false
  const normalized = status.toLowerCase()
  return normalized === 'canceled' || normalized === 'cancelled'
}

function isConfirmedBooking(status?: string | null) {
  if (!status) return false
  return status.toLowerCase() === 'confirmed'
}

function hasLessonStarted(startAt?: string | null) {
  if (!startAt) return false
  const startTime = new Date(startAt).getTime()
  if (Number.isNaN(startTime)) return false
  return Date.now() >= startTime
}

type PresenceOption = 'none' | 'present' | 'absent'

function presenceToOption(value: boolean | null | undefined): PresenceOption {
  if (value === true) return 'present'
  if (value === false) return 'absent'
  return 'none'
}

function optionToPresence(option: PresenceOption): boolean | null {
  if (option === 'present') return true
  if (option === 'absent') return false
  return null
}

function lessonSeatsLabel(lesson?: Lesson | null) {
  if (!lesson) return '-'
  const capacity = Number(lesson.lessonCapacity ?? 0)
  const available = Number(lesson.availableSeats ?? 0)
  if (!Number.isFinite(capacity) || !Number.isFinite(available)) return '-'
  const occupied = Math.max(0, capacity - available)
  return `${occupied}/${capacity}`
}

function parseNumeric(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isLessonNonBookable(lesson?: Lesson | null) {
  if (!lesson) return false
  const status = lesson.status?.toLowerCase()
  if (status !== 'scheduled') {
    return false
  }
  const dailySeats = parseNumeric(
    lesson.dailyAvailability ?? lesson.dailyCapacity
  )
  const occupancy = parseNumeric(lesson.dailyOccupancy)
  if (dailySeats === null || occupancy === null) {
    return false
  }
  return occupancy >= dailySeats
}

function studentLabel(student?: Student | null) {
  if (!student) return 'Caricamento...'
  return `${student.lastName ?? ''} ${student.firstName ?? ''}`.trim() || '-'
}

function studentClassLabel(student?: Student | null) {
  if (!student) return null
  if (student.sectionName) {
    return student.year
      ? `${student.year}${student.sectionName}`
      : student.sectionName
  }
  return student.year ? `Anno ${student.year}` : null
}

export default function TutorLessonDetailsPage() {
  const params = useParams()
  const lessonId = String(params?.id ?? '')
  const [lesson, setLesson] = React.useState<Lesson | null>(null)
  const [lessonLoading, setLessonLoading] = React.useState(true)
  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading] = React.useState(true)
  const [subjects, setSubjects] = React.useState<Subject[]>([])
  const [studentMap, setStudentMap] = React.useState<Map<string, Student>>(
    new Map()
  )
  const [presenceDrafts, setPresenceDrafts] = React.useState<
    Record<string, boolean | null>
  >({})
  const [presenceSaving, setPresenceSaving] = React.useState<
    Record<string, boolean>
  >({})
  const [topicDialogOpen, setTopicDialogOpen] = React.useState(false)
  const [topicDialogValue, setTopicDialogValue] = React.useState('')
  const [topicDialogStudent, setTopicDialogStudent] = React.useState('')
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [isCancelling, setIsCancelling] = React.useState(false)
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [feedbackTarget, setFeedbackTarget] = React.useState<Booking | null>(
    null
  )
  const [feedbackTargetId, setFeedbackTargetId] = React.useState<string | null>(
    null
  )
  const [feedbackText, setFeedbackText] = React.useState('')
  const [feedbackRating, setFeedbackRating] = React.useState<number>(5)
  const [isSavingFeedback, setIsSavingFeedback] = React.useState(false)
  const [feedbackByBooking, setFeedbackByBooking] = React.useState<
    Map<string, Feedback>
  >(new Map())

  const subjectMap = React.useMemo(() => {
    const map = new Map<string, Subject>()
    subjects.forEach((subject) => map.set(subject.id, subject))
    return map
  }, [subjects])

  const filteredBookings = React.useMemo(() => {
    return bookings.filter((booking) => isConfirmedBooking(booking.status))
  }, [bookings])

  const hasConfirmedBookings = React.useMemo(
    () => bookings.some((booking) => isConfirmedBooking(booking.status)),
    [bookings]
  )

  const canCancelLesson =
    Boolean(lesson) &&
    !isCanceledStatus(lesson?.status) &&
    !hasConfirmedBookings

  const loadLesson = React.useCallback(async () => {
    if (!lessonId) return
    setLessonLoading(true)
    try {
      const response = await fetch(`/api/lessons/${lessonId}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare la lezione.')
      }
      const payload = await response.json()
      setLesson(payload as Lesson)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile caricare la lezione.'
      )
    } finally {
      setLessonLoading(false)
    }
  }, [lessonId])

  const loadBookings = React.useCallback(async () => {
    if (!lessonId) return
    setBookingsLoading(true)
    try {
      const response = await fetch(`/api/lessons/${lessonId}/bookings`)
      if (!response.ok) {
        throw new Error('Impossibile caricare le prenotazioni.')
      }
      const payload = await response.json()
      setBookings(extractPayloadArray<Booking>(payload))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile caricare le prenotazioni.'
      )
    } finally {
      setBookingsLoading(false)
    }
  }, [lessonId])

  const loadFeedback = React.useCallback(async () => {
    if (!lessonId) return
    try {
      const response = await fetch(
        `/api/feedback/me?lessonId=${lessonId}&limit=200`
      )
      if (!response.ok) {
        throw new Error('Impossibile caricare i feedback.')
      }
      const payload = await response.json()
      const items = extractPayloadArray<Feedback>(payload)
      setFeedbackByBooking(
        new Map(items.map((item) => [item.bookingId, item]))
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile caricare i feedback.'
      )
    }
  }, [lessonId])

  React.useEffect(() => {
    void loadLesson()
    void loadBookings()
    void loadFeedback()
  }, [loadBookings, loadFeedback, loadLesson])

  React.useEffect(() => {
    let isMounted = true

    async function loadSubjects() {
      try {
        const response = await fetch('/api/subjects')
        if (!response.ok) {
          throw new Error('Impossibile caricare le materie.')
        }
        const payload = await response.json()
        if (isMounted) {
          setSubjects(extractPayloadArray<Subject>(payload))
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le materie.'
        )
      }
    }

    void loadSubjects()

    return () => {
      isMounted = false
    }
  }, [])

  React.useEffect(() => {
    let isMounted = true
    const missingIds = Array.from(
      new Set(
        bookings
          .map((booking) => booking.studentId)
          .filter((id) => !studentMap.has(id))
      )
    )

    if (missingIds.length === 0) {
      return
    }

    async function loadMissingStudents() {
      const results = await Promise.allSettled(
        missingIds.map(async (id) => {
          const response = await fetch(`/api/users/${id}`)
          if (!response.ok) {
            return null
          }
          const payload = await response.json()
          return payload as Student
        })
      )

      if (!isMounted) {
        return
      }

      setStudentMap((prev) => {
        const next = new Map(prev)
        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            next.set(result.value.id, result.value)
          }
        })
        return next
      })
    }

    void loadMissingStudents()

    return () => {
      isMounted = false
    }
  }, [bookings, studentMap])

  const handlePresenceSave = React.useCallback(
    async (booking: Booking, value: boolean | null) => {
      setPresenceSaving((prev) => ({ ...prev, [booking.id]: true }))
      try {
        const response = await fetch(
          `/api/lessons/${lessonId}/bookings/${booking.id}/presence`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ present: value })
          }
        )
        if (!response.ok) {
          throw new Error('Impossibile aggiornare la presenza.')
        }
        toast.success('Presenza aggiornata.')
        setPresenceDrafts((prev) => {
          const next = { ...prev }
          delete next[booking.id]
          return next
        })
        await loadBookings()
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile aggiornare la presenza.'
        )
      } finally {
        setPresenceSaving((prev) => ({ ...prev, [booking.id]: false }))
      }
    },
    [lessonId, loadBookings]
  )

  const handleCancelLesson = React.useCallback(async () => {
    if (!lessonId) return
    setIsCancelling(true)
    try {
      const response = await fetch(`/api/lessons/${lessonId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })
      if (!response.ok) {
        throw new Error('Impossibile annullare la lezione.')
      }
      toast.success('Lezione annullata.')
      setCancelOpen(false)
      await loadLesson()
      await loadBookings()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile annullare la lezione.'
      )
    } finally {
      setIsCancelling(false)
    }
  }, [lessonId, loadBookings, loadLesson])

  const handleSaveFeedback = React.useCallback(async () => {
    if (!feedbackTarget || !lessonId) {
      return
    }
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
      const requestBody = feedbackTargetId
        ? {
            rating: feedbackRating,
            text: trimmed
          }
        : {
            bookingId: feedbackTarget.id,
            rating: feedbackRating,
            text: trimmed
          }
      const response = await fetch(
        feedbackTargetId
          ? `/api/lessons/${lessonId}/feedback/${feedbackTargetId}`
          : `/api/lessons/${lessonId}/feedback`,
        {
          method: feedbackTargetId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
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
        setFeedbackTargetId(saved.id)
      } else {
        await loadFeedback()
      }
      toast.success('Feedback salvato.')
      setFeedbackOpen(false)
      setFeedbackTarget(null)
      setFeedbackTargetId(null)
      setFeedbackText('')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile salvare il feedback.'
      )
    } finally {
      setIsSavingFeedback(false)
    }
  }, [
    feedbackTarget,
    feedbackTargetId,
    feedbackRating,
    feedbackText,
    lessonId,
    loadFeedback
  ])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl space-y-6'>
          <div className='mb-6 self-start'>
            <BackButton />
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h1 className='text-2xl'>Dettagli lezione</h1>
              <p className='text-sm text-muted-foreground'>
                Visualizza le informazioni della lezione e aggiorna la presenza.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <CardTitle>Panoramica</CardTitle>
              <Button
                variant='destructive'
                size='sm'
                onClick={() => setCancelOpen(true)}
                disabled={!canCancelLesson}
                className='w-full sm:w-auto'
              >
                Annulla lezione
              </Button>
            </CardHeader>
            <CardContent>
              {lessonLoading ? (
                <p className='text-sm text-muted-foreground'>Caricamento...</p>
              ) : lesson ? (
                <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                  <div>
                    <p className='text-xs text-muted-foreground'>Data</p>
                    <p className='text-sm font-medium'>
                      {formatItalianDate(lesson.startAt)}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>Materia</p>
                    <p className='text-sm font-medium'>
                      {subjectMap.get(lesson.subjectId)?.name ?? '-'}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>Posti</p>
                    <p className='text-sm font-medium'>
                      {lessonSeatsLabel(lesson)}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>Stato</p>
                    <Badge variant={statusVariant(lesson.status)}>
                      {formatStatusLabel(lesson.status)}
                    </Badge>
                    {isLessonNonBookable(lesson) ? (
                      <div className='mt-2'>
                        <Badge variant='outline'>Non prenotabile</Badge>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  Lezione non disponibile.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <CardTitle>Prenotazioni</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='rounded-lg border'>
                <Table>
                  <TableHeader className='bg-muted/50'>
                    <TableRow>
                      <TableHead>Studente</TableHead>
                      <TableHead className='w-[45%]'>Argomento</TableHead>
                      <TableHead className='w-40'>Presenza</TableHead>
                      <TableHead className='w-12'>
                        <span className='sr-only'>Feedback</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookingsLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className='text-muted-foreground'
                        >
                          Caricamento...
                        </TableCell>
                      </TableRow>
                    ) : filteredBookings.length ? (
                      filteredBookings.map((booking) => {
                        const student = studentMap.get(booking.studentId)
                        const studentEmail = student?.email?.trim() ?? ''
                        const disabled =
                          isCanceledBooking(booking.status) ||
                          isCanceledStatus(lesson?.status)
                        const canGiveFeedback =
                          hasLessonStarted(lesson?.startAt) &&
                          isConfirmedBooking(booking.status) &&
                          booking.studentPresence === true
                        const draftValue = presenceDrafts[booking.id]
                        const effectiveValue =
                          draftValue !== undefined
                            ? draftValue
                            : booking.studentPresence
                        const isDirty =
                          draftValue !== undefined &&
                          draftValue !== booking.studentPresence
                        const isSaving = Boolean(presenceSaving[booking.id])
                        return (
                          <TableRow key={booking.id}>
                            <TableCell>
                              <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'>
                                <div className='flex min-w-0 flex-col'>
                                  <span className='whitespace-nowrap'>
                                    {studentLabel(student)}
                                  </span>
                                  {studentClassLabel(student) ? (
                                    <span className='text-xs text-muted-foreground'>
                                      {studentClassLabel(student)}
                                    </span>
                                  ) : null}
                                </div>
                                {studentEmail ? (
                                  <Button
                                    asChild
                                    size='sm'
                                    variant='outline'
                                    className='w-fit self-start sm:self-center'
                                  >
                                    <a href={`mailto:${studentEmail}`}>
                                      Contatta
                                      <Mail className='h-4 w-4' />
                                    </a>
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className='w-[45%] max-w-[24rem]'>
                              {booking.topic ? (
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  className='h-auto w-full justify-start gap-2 px-0 text-left text-sm font-normal'
                                  onClick={() => {
                                    setTopicDialogValue(booking.topic || '-')
                                    setTopicDialogStudent(
                                      studentLabel(student) || 'Studente'
                                    )
                                    setTopicDialogOpen(true)
                                  }}
                                >
                                  <span className='truncate'>
                                    {booking.topic}
                                  </span>
                                  <ExternalLink className='h-4 w-4 shrink-0 text-muted-foreground' />
                                </Button>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className='w-40'>
                              <div className='flex items-center gap-2'>
                                <Select
                                  value={presenceToOption(effectiveValue)}
                                  onValueChange={(value) => {
                                    const nextValue = optionToPresence(
                                      value as PresenceOption
                                    )
                                    setPresenceDrafts((prev) => {
                                      const next = { ...prev }
                                      if (
                                        nextValue === booking.studentPresence
                                      ) {
                                        delete next[booking.id]
                                      } else {
                                        next[booking.id] = nextValue
                                      }
                                      return next
                                    })
                                  }}
                                  disabled={disabled}
                                >
                                  <SelectTrigger className='w-28'>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {booking.studentPresence === null ? (
                                      <SelectItem value='none'>-</SelectItem>
                                    ) : null}
                                    <SelectItem value='present'>
                                      Presente
                                    </SelectItem>
                                    <SelectItem value='absent'>
                                      Assente
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant='outline'
                                  size='icon'
                                  className='h-8 w-8'
                                  disabled={disabled || isSaving || !isDirty}
                                  onClick={() =>
                                    void handlePresenceSave(
                                      booking,
                                      effectiveValue
                                    )
                                  }
                                >
                                  <Save className='h-4 w-4' />
                                  <span className='sr-only'>Salva</span>
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell className='w-12 text-right'>
                              {canGiveFeedback ? (
                                <Button
                                  variant='ghost'
                                  size='icon'
                                  className='h-6 w-6 p-0'
                                  aria-label='Aggiungi feedback'
                                  onClick={() => {
                                    const existing = feedbackByBooking.get(
                                      booking.id
                                    )
                                    setFeedbackTarget(booking)
                                    setFeedbackTargetId(existing?.id ?? null)
                                    setFeedbackText(existing?.text ?? '')
                                    setFeedbackRating(existing?.rating ?? 5)
                                    setFeedbackOpen(true)
                                  }}
                                >
                                  <MessageSquare className='h-4 w-4' />
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className='text-muted-foreground'
                        >
                          Nessuna prenotazione.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <AlertDialog open={topicDialogOpen} onOpenChange={setTopicDialogOpen}>
        <AlertDialogContent className='max-w-[calc(100%-3rem)] sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Argomento</AlertDialogTitle>
          </AlertDialogHeader>
          <div className='space-y-3'>
            <div className='text-sm text-muted-foreground'>
              Studente: {topicDialogStudent || '—'}
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

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className='max-w-[calc(100%-3rem)] sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Annulla lezione</AlertDialogTitle>
            <AlertDialogDescription>
              Confermi l&apos;annullamento della lezione selezionata?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {lesson && (
            <div className='text-sm text-muted-foreground'>
              Data: {formatItalianDate(lesson.startAt)} <br />
              Materia: {subjectMap.get(lesson.subjectId)?.name ?? '-'}
            </div>
          )}
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleCancelLesson()
              }}
              disabled={isCancelling}
            >
              {isCancelling ? 'Annullamento...' : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={feedbackOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFeedbackOpen(false)
            setFeedbackTarget(null)
            setFeedbackTargetId(null)
            setFeedbackText('')
            setFeedbackRating(5)
          } else {
            setFeedbackOpen(true)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Feedback studente</AlertDialogTitle>
            <AlertDialogDescription>
              {feedbackTarget
                ? `Studente: ${studentLabel(
                    studentMap.get(feedbackTarget.studentId)
                  )}`
                : 'Studente selezionato'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-muted-foreground'>
                Valutazione
              </label>
              <Select
                value={String(feedbackRating)}
                onValueChange={(value) => {
                  const parsed = Number(value)
                  if (Number.isFinite(parsed)) {
                    setFeedbackRating(parsed)
                  }
                }}
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
            />
            <div className='text-xs text-muted-foreground'>
              {feedbackText.length}/1000
            </div>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleSaveFeedback()
              }}
              disabled={isSavingFeedback}
            >
              {isSavingFeedback ? 'Salvataggio...' : 'Salva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
