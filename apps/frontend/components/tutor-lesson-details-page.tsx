'use client'

import { useBackHref } from '@/lib/back-link'
import { EmptyState } from '@/components/empty-state'
import * as React from 'react'
import { useParams } from 'next/navigation'
import { Mail, MessageSquare, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { BackButton } from '@/components/back-button'
import { LessonSummary, lessonStateOf } from '@/components/lesson-summary'
import { PresenceButtons } from '@/components/presence-buttons'
import { usePresenceConfirm } from '@/components/presence-confirm'
import { StarRating } from '@/components/star-rating'
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
import { Textarea } from '@/components/ui/textarea'
import { extractPayloadArray } from '@/lib/backend-response'
import { classLabel } from '@/lib/class-label'
import { formatItalianDate } from '@/lib/format-date'
import { canMarkPresence } from '@/lib/lesson-schedule'
import { lessonSubject } from '@/lib/lesson-subject'
import { dayKeyOf, mondayOf } from '@/lib/school-week'
import { capitalizeFirst } from '@/lib/capitalize'
import { FEEDBACK_LOCKED_NOTICE, FeedbackHistoryToggle } from '@/components/feedback-history'

type Lesson = {
  id: string
  tutorId: string
  subjectId: string | null
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyCapacity?: number | null
  dailyAvailability?: number | null
  dailyOccupancy?: number | null
  availableSeats: number
  status: string
  subjectOptions?: Array<{ id: string, name: string }>
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
  versionCount?: number
  lastEditorRole?: string | null
  editableUntil?: string | null
}

// A week after the lesson the tutor's feedback can no longer change.
function isFeedbackEditable(feedback: Feedback | undefined) {
  return !feedback || (Boolean(feedback.editableUntil) && new Date() <= new Date(feedback.editableUntil!))
}

function isCanceledStatus(status?: string | null) {
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
  return student ? classLabel(student.year, student.sectionName) : null
}

export default function TutorLessonDetailsPage() {
  const params = useParams()
  const cameFrom = useBackHref('')
  const lessonId = String(params?.id ?? '')
  const [lesson, setLesson] = React.useState<Lesson | null>(null)
  const [lessonLoading, setLessonLoading] = React.useState(true)
  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading] = React.useState(true)
  const [subjects, setSubjects] = React.useState<Subject[]>([])
  const [studentMap, setStudentMap] = React.useState<Map<string, Student>>(
    new Map()
  )
  const [presenceSaving, setPresenceSaving] = React.useState<
    Record<string, boolean>
  >({})
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [isCancelling, setIsCancelling] = React.useState(false)
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  // Past the week the tutor can still read what they wrote, no longer change it.
  const [feedbackReadonly, setFeedbackReadonly] = React.useState(false)
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

  const state = lesson ? lessonStateOf(lesson) : null
  const presence = usePresenceConfirm()
  const subjectName = lesson?.subjectId ? lessonSubject(lesson.subjectId, subjectMap)?.name ?? null : null

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-3xl space-y-6'>
          <div>
            {/* Back to the home when the tutor came from there, else to the week of this lesson. */}
            <BackButton href={cameFrom || (lesson ? `/tutor/lessons?week=${mondayOf(dayKeyOf(new Date(lesson.startAt)))}` : '/tutor/lessons')} />
          </div>

          {lessonLoading && !lesson ? (
            <Skeleton className='h-36' />
          ) : !lesson ? (
            <EmptyState>Lezione non disponibile.</EmptyState>
          ) : (
            <LessonSummary
              subjectName={subjectName}
              startAt={lesson.startAt}
              durationMinutes={lesson.durationMinutes}
              status={lesson.status}
              booked={filteredBookings.length}
              seats={lesson.lessonCapacity}
              note={isLessonNonBookable(lesson) ? 'Hai già raggiunto i posti del giorno: nessun altro può prenotarla.' : undefined}
              actions={canCancelLesson && state === 'upcoming'
                ? (
                    <Button variant='outline' className='text-destructive' onClick={() => setCancelOpen(true)}>
                      <XCircle className='h-4 w-4' /> Annulla lezione
                    </Button>
                  )
                : undefined}
            />
          )}

          <section className='space-y-3'>
            <div className='flex flex-wrap items-baseline justify-between gap-2'>
              <h2 className='text-lg font-semibold'>Studenti</h2>
              {state === 'upcoming' && filteredBookings.length > 0 && (
                <span className='text-sm text-muted-foreground'>Le presenze si segnano da quando inizia la lezione.</span>
              )}
            </div>
            {bookingsLoading ? (
              <Skeleton className='h-24' />
            ) : filteredBookings.length === 0 ? (
              <EmptyState>Nessuno ha prenotato questa lezione.</EmptyState>
            ) : (
              filteredBookings.map((booking) => {
                const student = studentMap.get(booking.studentId)
                const studentEmail = student?.email?.trim() ?? ''
                const presenceOpen = lesson ? canMarkPresence(lesson) : false
                const canGiveFeedback = hasLessonStarted(lesson?.startAt) && booking.studentPresence === true
                const existing = feedbackByBooking.get(booking.id)
                const isSaving = Boolean(presenceSaving[booking.id])
                return (
                  <div key={booking.id} className='space-y-3 rounded-lg border bg-card p-4'>
                    <div className='flex items-start justify-between gap-2'>
                      <div className='min-w-0'>
                        <div className='font-medium'>{studentLabel(student)}</div>
                        {studentClassLabel(student) && <div className='text-sm text-muted-foreground'>{studentClassLabel(student)}</div>}
                      </div>
                      <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
                        {!presenceOpen && state !== 'upcoming' && (
                          <Badge variant={booking.studentPresence === true ? 'success' : booking.studentPresence === false ? 'destructive' : 'outline'}>
                            {booking.studentPresence === true ? 'Presente' : booking.studentPresence === false ? 'Assente' : 'Presenza non segnata'}
                          </Badge>
                        )}
                        {studentEmail && (
                          <Button asChild size='sm' variant='outline'>
                            <a href={`mailto:${studentEmail}`}><Mail className='h-4 w-4' /> Scrivi</a>
                          </Button>
                        )}
                      </div>
                    </div>
                    {/* The topic stretches down to the presence buttons, its text staying at the top. */}
                    <div className='flex flex-col gap-4 sm:flex-row sm:items-stretch'>
                      <div className='flex min-w-0 flex-1 flex-col gap-3'>
                        {booking.topic && <p className='flex-1 rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap'>{booking.topic}</p>}
                        {(canGiveFeedback || existing) && (
                          <div className='flex flex-wrap items-center gap-2'>
                            {(existing || canGiveFeedback) && (
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() => {
                                  setFeedbackTarget(booking)
                                  setFeedbackTargetId(existing?.id ?? null)
                                  setFeedbackText(existing?.text ?? '')
                                  setFeedbackRating(existing?.rating ?? 5)
                                  setFeedbackReadonly(!isFeedbackEditable(existing))
                                  setFeedbackOpen(true)
                                }}
                              >
                                <MessageSquare className='h-4 w-4' />
                                {!existing ? 'Feedback' : isFeedbackEditable(existing) ? 'Modifica feedback' : 'Il tuo feedback'}
                              </Button>
                            )}
                            {existing && <StarRating value={existing.rating} size='sm' />}
                          </div>
                        )}
                        {existing && (
                          <FeedbackHistoryToggle
                            key={`${existing.id}-${existing.versionCount ?? 1}`}
                            feedbackId={existing.id}
                            versionCount={existing.versionCount ?? 1}
                            lastEditorRole={existing.lastEditorRole ?? null}
                            audience='author'
                          />
                        )}
                      </div>
                      {presenceOpen && (
                        <PresenceButtons
                          value={booking.studentPresence}
                          disabled={isSaving}
                          onPresent={() => presence.ask({ studentName: studentLabel(student), present: booking.studentPresence === true ? null : true, run: () => handlePresenceSave(booking, booking.studentPresence === true ? null : true) })}
                          onAbsent={() => presence.ask({ studentName: studentLabel(student), present: booking.studentPresence === false ? null : false, run: () => handlePresenceSave(booking, booking.studentPresence === false ? null : false) })}
                        />
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </section>
        </div>
      </div>

      {presence.dialog}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className='max-w-[calc(100%-2rem)] sm:max-w-md'>
          <AlertDialogHeader className='text-left sm:text-left'>
            <AlertDialogTitle>Annullare la lezione?</AlertDialogTitle>
            <AlertDialogDescription className='text-left'>
              {lesson && `${formatItalianDate(lesson.startAt)}. `}Nessuno l&apos;ha prenotata: gli studenti non la vedranno più.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Indietro</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleCancelLesson()
              }}
              disabled={isCancelling}
            >
              {isCancelling ? 'Annullamento...' : 'Annulla lezione'}
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
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-2rem)] sm:max-w-lg'>
          <AlertDialogHeader className='text-left sm:text-left'>
            <AlertDialogTitle>
              {feedbackReadonly
                ? `Il tuo feedback per ${feedbackTarget ? studentLabel(studentMap.get(feedbackTarget.studentId)) : 'lo studente'}`
                : <>Com&apos;è andata con {feedbackTarget ? studentLabel(studentMap.get(feedbackTarget.studentId)) : 'lo studente'}?</>}
            </AlertDialogTitle>
            <AlertDialogDescription className='text-left'>Il feedback lo leggono gli organizzatori.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-3'>
            <StarRating value={feedbackRating} onChange={feedbackReadonly ? undefined : setFeedbackRating} />
            <Textarea
              value={feedbackText}
              onChange={(event) => setFeedbackText(capitalizeFirst(event.target.value))}
              placeholder='Era preparato? Su cosa avete lavorato?'
              maxLength={1000}
              rows={4}
              readOnly={feedbackReadonly}
            />
            {feedbackReadonly
              ? <p className='text-xs text-muted-foreground'>{FEEDBACK_LOCKED_NOTICE}</p>
              : <div className='text-right text-xs text-muted-foreground'>{feedbackText.length}/1000</div>}
          </div>
          <AlertDialogFooter>
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
