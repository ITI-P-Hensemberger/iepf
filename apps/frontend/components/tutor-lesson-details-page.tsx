'use client'

import { EmptyState } from '@/components/empty-state'
import * as React from 'react'
import { useParams } from 'next/navigation'
import { MessageSquare, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { ChatButton, useChatUnread, useOpenChat } from '@/components/lesson-chat'
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
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, jsonBody } from '@/lib/api-fetch'

type Lesson = {
  id: string
  tutorId: string
  subjectId: string | null
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyCapacity?: number | null
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
  const dailySeats = parseNumeric(lesson.dailyCapacity)
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

const noBookings: Booking[] = []
const noSubjects: Subject[] = []

export default function TutorLessonDetailsPage() {
  const params = useParams()
  const lessonId = String(params?.id ?? '')
  const queryClient = useQueryClient()
  const unread = useChatUnread()
  const openChat = useOpenChat()
  // A lesson that is not theirs (or no longer, after a reschedule) is refused: the page says why.
  const { data: lesson = null, isPending: lessonLoading, error: lessonError } = useQuery({
    queryKey: ['lessons', lessonId],
    queryFn: () => apiFetch<Lesson>(`/api/lessons/${lessonId}`, 'Impossibile caricare la lezione.'),
    enabled: Boolean(lessonId),
    retry: false,
    meta: { inline: true }
  })
  const { data: bookings = noBookings, isPending: bookingsLoading } = useQuery({
    queryKey: ['lessons', lessonId, 'bookings'],
    queryFn: async () => extractPayloadArray<Booking>(await apiFetch(`/api/lessons/${lessonId}/bookings`, 'Impossibile caricare le prenotazioni.')),
    enabled: lesson !== null
  })
  const { data: subjects = noSubjects } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => extractPayloadArray<Subject>(await apiFetch('/api/subjects', 'Impossibile caricare le materie.'))
  })
  const { data: feedbackItems } = useQuery({
    queryKey: ['feedback', 'me', 'lesson', lessonId],
    queryFn: async () => extractPayloadArray<Feedback>(await apiFetch(`/api/feedback/me?lessonId=${lessonId}&limit=200`, 'Impossibile caricare i feedback.')),
    enabled: lesson !== null
  })
  const feedbackByBooking = React.useMemo(() => new Map((feedbackItems ?? []).map((item) => [item.bookingId, item])), [feedbackItems])
  // Students only name the bookings: one that fails to load is left without a name.
  const studentIds = Array.from(new Set(bookings.map((booking) => booking.studentId)))
  const studentResults = useQueries({
    queries: studentIds.map((id) => ({
      queryKey: ['users', id],
      queryFn: () => apiFetch<Student>(`/api/users/${id}`, 'Impossibile caricare lo studente.'),
      meta: { inline: true }
    }))
  })
  const studentMap = new Map<string, Student>()
  studentResults.forEach((result) => {
    if (result.data) studentMap.set(result.data.id, result.data)
  })
  const [cancelOpen, setCancelOpen] = React.useState(false)
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

  const reloadLesson = () => queryClient.invalidateQueries({ queryKey: ['lessons'] })

  const presenceMutation = useMutation({
    mutationFn: ({ booking, value }: { booking: Booking, value: boolean | null }) =>
      apiFetch(`/api/lessons/${lessonId}/bookings/${booking.id}/presence`, 'Impossibile aggiornare la presenza.', jsonBody('PATCH', { present: value })),
    onSuccess: () => {
      toast.success('Presenza aggiornata.')
      return reloadLesson()
    }
  })
  const presenceSaving: Record<string, boolean> = presenceMutation.isPending && presenceMutation.variables
    ? { [presenceMutation.variables.booking.id]: true }
    : {}
  const handlePresenceSave = (booking: Booking, value: boolean | null) =>
    presenceMutation.mutateAsync({ booking, value }).then(() => {}, () => {})

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch(`/api/lessons/${lessonId}/cancel`, 'Impossibile annullare la lezione.', jsonBody('POST', {})),
    onSuccess: () => {
      toast.success('Lezione annullata.')
      setCancelOpen(false)
      return reloadLesson()
    }
  })
  const isCancelling = cancelMutation.isPending
  const handleCancelLesson = () => {
    if (lessonId) cancelMutation.mutate()
  }

  const saveFeedback = useMutation({
    mutationFn: ({ target, targetId, value }: { target: Booking, targetId: string | null, value: { rating: number, text: string } }) => targetId
      ? apiFetch(`/api/lessons/${lessonId}/feedback/${targetId}`, 'Impossibile salvare il feedback.', jsonBody('PATCH', value))
      : apiFetch(`/api/lessons/${lessonId}/feedback`, 'Impossibile salvare il feedback.', jsonBody('POST', { bookingId: target.id, ...value })),
    onSuccess: () => {
      toast.success('Feedback salvato.')
      setFeedbackOpen(false)
      setFeedbackTarget(null)
      setFeedbackTargetId(null)
      setFeedbackText('')
      return queryClient.invalidateQueries({ queryKey: ['feedback'] })
    }
  })
  const isSavingFeedback = saveFeedback.isPending

  const handleSaveFeedback = () => {
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
    saveFeedback.mutate({ target: feedbackTarget, targetId: feedbackTargetId, value: { rating: feedbackRating, text: trimmed } })
  }

  const state = lesson ? lessonStateOf(lesson) : null
  const presence = usePresenceConfirm()
  const subjectName = lesson?.subjectId ? lessonSubject(lesson.subjectId, subjectMap)?.name ?? null : null

  // Without ?from=, back leads to the week of this lesson.
  const backFallback = lesson ? `/tutor/lessons?week=${mondayOf(dayKeyOf(new Date(lesson.startAt)))}` : '/tutor/lessons'

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-6xl space-y-6'>
          {lessonLoading && !lesson && !lessonError ? (
            <>
              <PageHeader title='Lezione' backHref={backFallback} />
              <Skeleton className='h-16' />
            </>
          ) : !lesson ? (
            <>
              <PageHeader title='Lezione' backHref={backFallback} />
              <EmptyState>{lessonError?.message ?? 'Lezione non disponibile.'}</EmptyState>
            </>
          ) : (
            <LessonSummary
              backHref={backFallback}
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

          {!lessonError && (
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
                        {unread.has(booking.id) && <ChatButton unread={unread.get(booking.id)} onClick={() => openChat(booking.id)} />}
                      </div>
                    </div>
                    {/* The topic stretches down to the presence buttons, its text staying at the top.
                        On phones the feedback button sits right above them: a wider gap keeps taps apart. */}
                    <div className='flex flex-col gap-8 sm:flex-row sm:items-stretch sm:gap-4'>
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
                          // Tutors can switch a mark but not take it back (the backend refuses).
                          onPresent={() => booking.studentPresence !== true && presence.ask({ studentName: studentLabel(student), present: true, run: () => handlePresenceSave(booking, true) })}
                          onAbsent={() => booking.studentPresence !== false && presence.ask({ studentName: studentLabel(student), present: false, run: () => handlePresenceSave(booking, false) })}
                        />
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </section>
          )}
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
                handleCancelLesson()
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
                handleSaveFeedback()
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
