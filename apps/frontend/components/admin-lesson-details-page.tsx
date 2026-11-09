'use client'

import { SegmentedTabs } from '@/components/segmented-tabs'
import { useHere, withFrom } from '@/lib/back-link'
import { EmptyState } from '@/components/empty-state'
import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CalendarClock, Mail, MessageSquare, MoreHorizontal, UserPlus, XCircle } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { LessonSummary } from '@/components/lesson-summary'
import { LessonHistory } from '@/components/admin-lesson-details/lesson-history'
import { PresenceButtons } from '@/components/presence-buttons'
import { usePresenceConfirm } from '@/components/presence-confirm'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, jsonBody } from '@/lib/api-fetch'
import { formatItalianDate } from '@/lib/format-date'
import { dayKeyOf } from '@/lib/school-week'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { capitalizeFirst } from '@/lib/capitalize'
import { BookStudentDialog } from '@/components/admin-lesson-details/book-student-dialog'
import { RescheduleLessonDialog } from '@/components/admin-lesson-details/reschedule-lesson-dialog'
import { useBookStudent } from '@/components/admin-lesson-details/use-book-student'
import { useRescheduleLesson } from '@/components/admin-lesson-details/use-reschedule-lesson'
import type { Lesson, Booking, Tutor, Student, Subject } from '@/components/admin-lesson-details/shared'
import { normalizePaged, formatBookingStatus, countsBadgeLabel, countsBadgeVariant, isCanceledStatus, isCanceledBooking, lessonOccupiedSeats, lessonDailySeatsLabel, tutorClassLabel, tutorLabel, studentLabel, studentClassLabel } from '@/components/admin-lesson-details/shared'

// Stable while the bookings load, so the memos built on them do not rerun on every render.
const noBookings: Booking[] = []

export default function AdminLessonDetailsPage() {
  const params = useParams()
  const here = useHere()
  const lessonId = params?.id as string

  const queryClient = useQueryClient()
  const { data: lesson = null, isPending: lessonLoading } = useQuery({
    queryKey: ['lessons', lessonId],
    queryFn: () => apiFetch<Lesson>(`/api/lessons/${lessonId}`, 'Impossibile caricare la lezione.')
  })
  const { data: bookings = noBookings, isPending: bookingsLoading } = useQuery({
    queryKey: ['lessons', lessonId, 'bookings'],
    queryFn: async () => normalizePaged<Booking>(await apiFetch(`/api/lessons/${lessonId}/bookings`, 'Impossibile caricare le prenotazioni.')).items
  })
  const [bookingFilter, setBookingFilter] = React.useState<
    'confirmed' | 'canceled' | 'all'
  >('all')

  // Subject, tutor and students only name things on the page: without them it still works.
  const { data: subject = null, isFetching: subjectLoading } = useQuery({
    queryKey: ['subjects', lesson?.subjectId],
    queryFn: () => apiFetch<Subject>(`/api/subjects/${lesson?.subjectId}`, 'Impossibile caricare la materia.'),
    enabled: Boolean(lesson?.subjectId),
    meta: { inline: true }
  })
  // An open lesson has no subject until a booking picks one of its tutor's.
  const subjectLabel =
    lesson && !lesson.subjectId ? '-' : (subject?.name ?? '-')
  const bookingSubjectOptions = lesson?.subjectOptions ?? []
  const { data: tutor = null, isPending: tutorPending } = useQuery({
    queryKey: ['users', lesson?.tutorId],
    queryFn: () => apiFetch<Tutor>(`/api/users/${lesson?.tutorId}`, 'Impossibile caricare il tutor.'),
    enabled: Boolean(lesson?.tutorId),
    meta: { inline: true }
  })
  const tutorLoading = Boolean(lesson?.tutorId) && tutorPending
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

  const [selectedBooking, setSelectedBooking] = React.useState<Booking | null>(
    null
  )

  const [topicTarget, setTopicTarget] = React.useState<Booking | null>(null)
  const [topicValue, setTopicValue] = React.useState('')

  const [cancelTarget, setCancelTarget] = React.useState<Booking | null>(null)
  const [cancelCountsForStudent, setCancelCountsForStudent] =
    React.useState(false)

  const [countsTarget, setCountsTarget] = React.useState<Booking | null>(null)
  const [countsValue, setCountsValue] = React.useState(false)

  const [lessonCountsOpen, setLessonCountsOpen] = React.useState(false)
  const [lessonCountsValue, setLessonCountsValue] = React.useState(false)

  const [cancelLessonOpen, setCancelLessonOpen] = React.useState(false)
  const [cancelLessonCountsForTutor, setCancelLessonCountsForTutor] =
    React.useState(false)

  // Every change here can move seats, hours and counts: the lesson, its bookings and the lists.
  const reloadLessons = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['lessons'] }),
    [queryClient]
  )
  const reschedule = useRescheduleLesson({ lesson, reloadLessons })
  const bookStudent = useBookStudent({ lessonId, reloadLessons })
  const { handleOpenReschedule } = reschedule
  const { setBookStudentOpen } = bookStudent

  const savePresence = useMutation({
    mutationFn: ({ booking, value }: { booking: Booking, value: boolean | null }) => apiFetch(
      `/api/lessons/${lessonId}/bookings/${booking.id}/presence`,
      'Impossibile aggiornare la presenza.',
      jsonBody('PATCH', { present: value })
    ),
    onSuccess: () => {
      toast.success('Presenza aggiornata.')
      return reloadLessons()
    }
  })
  const presenceSaving: Record<string, boolean> = savePresence.isPending && savePresence.variables
    ? { [savePresence.variables.booking.id]: true }
    : {}
  const handlePresenceSave = (booking: Booking, value: boolean | null) =>
    savePresence.mutateAsync({ booking, value }).then(() => {}, () => {})

  const updateTopic = useMutation({
    mutationFn: ({ booking, topic }: { booking: Booking, topic: string }) => apiFetch(
      `/api/lessons/${lessonId}/bookings/${booking.id}/topic`,
      "Impossibile aggiornare l'argomento.",
      jsonBody('PATCH', { topic })
    ),
    onSuccess: () => {
      toast.success('Argomento aggiornato.')
      setTopicTarget(null)
      setTopicValue('')
      return reloadLessons()
    }
  })
  const isUpdatingTopic = updateTopic.isPending
  const handleTopicUpdate = () => {
    if (!topicTarget) return
    const topic = topicValue.trim()
    if (!topic) {
      toast.error('Inserisci un argomento valido.')
      return
    }
    updateTopic.mutate({ booking: topicTarget, topic })
  }

  const cancelBooking = useMutation({
    mutationFn: ({ booking, countsForStudent }: { booking: Booking, countsForStudent: boolean }) => apiFetch(
      `/api/lessons/${lessonId}/bookings/${booking.id}/cancel`,
      'Impossibile annullare la prenotazione.',
      jsonBody('PATCH', { countsForStudent })
    ),
    onSuccess: () => {
      toast.success('Prenotazione annullata.')
      setCancelTarget(null)
      return reloadLessons()
    }
  })
  const isCanceling = cancelBooking.isPending
  const handleCancelBooking = () => {
    if (cancelTarget) cancelBooking.mutate({ booking: cancelTarget, countsForStudent: cancelCountsForStudent })
  }

  const handleOpenTopicDialog = (booking: Booking) => {
    setTopicTarget(booking)
    setTopicValue(booking.topic)
  }

  const handleOpenCancelDialog = (booking: Booking) => {
    setCancelTarget(booking)
    setCancelCountsForStudent(Boolean(booking.countsForStudent))
  }

  const handleOpenCountsDialog = (booking: Booking) => {
    setCountsTarget(booking)
    setCountsValue(Boolean(booking.countsForStudent))
  }

  const updateCounts = useMutation({
    mutationFn: ({ booking, countsForStudent }: { booking: Booking, countsForStudent: boolean }) => apiFetch(
      `/api/lessons/${lessonId}/bookings/${booking.id}/counts`,
      'Impossibile aggiornare il conteggio.',
      jsonBody('PATCH', { countsForStudent })
    ),
    onSuccess: () => {
      toast.success('Conteggio aggiornato.')
      setCountsTarget(null)
      return reloadLessons()
    }
  })
  const isUpdatingCounts = updateCounts.isPending
  const handleUpdateCounts = () => {
    if (countsTarget) updateCounts.mutate({ booking: countsTarget, countsForStudent: countsValue })
  }

  const cancelLesson = useMutation({
    mutationFn: ({ id, countsForTutor }: { id: string, countsForTutor: boolean }) => apiFetch(
      `/api/lessons/${id}/cancel`,
      'Impossibile annullare la lezione.',
      jsonBody('POST', { countsForTutor })
    ),
    onSuccess: () => {
      toast.success('Lezione annullata.')
      setCancelLessonOpen(false)
      return reloadLessons()
    }
  })
  const isCancellingLesson = cancelLesson.isPending
  const handleCancelLesson = () => {
    if (lesson) cancelLesson.mutate({ id: lesson.id, countsForTutor: cancelLessonCountsForTutor })
  }

  const updateLessonCounts = useMutation({
    mutationFn: ({ id, countsForTutor }: { id: string, countsForTutor: boolean }) => apiFetch(
      `/api/lessons/${id}/counts`,
      'Impossibile aggiornare il conteggio tutor.',
      jsonBody('PATCH', { countsForTutor })
    ),
    onSuccess: () => {
      toast.success('Conteggio tutor aggiornato.')
      setLessonCountsOpen(false)
      return reloadLessons()
    }
  })
  const isUpdatingLessonCounts = updateLessonCounts.isPending
  const handleUpdateLessonCounts = () => {
    if (lesson) updateLessonCounts.mutate({ id: lesson.id, countsForTutor: lessonCountsValue })
  }

  const filteredBookings = React.useMemo(() => {
    if (bookingFilter === 'all') {
      return bookings
    }
    if (bookingFilter === 'canceled') {
      return bookings.filter((booking) => isCanceledBooking(booking.status))
    }
    return bookings.filter((booking) => !isCanceledBooking(booking.status))
  }, [bookingFilter, bookings])

  const bookedCount = bookings.filter((booking) => !isCanceledBooking(booking.status)).length
  const lessonCanceled = isCanceledStatus(lesson?.status)
  const presence = usePresenceConfirm()

  // Without ?from=, back leads to the day of this lesson.
  const backFallback = lesson ? `/admin/lessons?day=${dayKeyOf(new Date(lesson.startAt))}` : '/admin/lessons'

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-6xl space-y-6'>
          {lessonLoading && !lesson ? (
            <>
              <PageHeader title='Lezione' backHref={backFallback} />
              <Skeleton className='h-16' />
            </>
          ) : !lesson ? (
            <>
              <PageHeader title='Lezione' backHref={backFallback} />
              <EmptyState>Lezione non disponibile.</EmptyState>
            </>
          ) : (
            <LessonSummary
              backHref={backFallback}
              subjectName={lesson.subjectId ? (subjectLoading ? '…' : subject?.name ?? null) : null}
              startAt={lesson.startAt}
              durationMinutes={lesson.durationMinutes}
              status={lesson.status}
              booked={bookedCount}
              seats={lesson.lessonCapacity}
              note={!lesson.subjectId && bookingSubjectOptions.length > 0
                ? `La materia la sceglie il primo studente che prenota, tra: ${bookingSubjectOptions.map((option) => option.name).join(', ')}.`
                : undefined}
              actions={(
                <>
                  {!lessonCanceled && (
                    <Button onClick={() => setBookStudentOpen(true)}>
                      <UserPlus className='h-4 w-4' /> Prenota per uno studente
                    </Button>
                  )}
                  {!lessonCanceled && (
                    <Button variant='outline' onClick={handleOpenReschedule}>
                      <CalendarClock className='h-4 w-4' /> Riprogramma
                    </Button>
                  )}
                  <Button asChild variant='outline'>
                    <Link href={withFrom(`/admin/feedback?feedbackLesson=${lesson.id}&feedbackRole=tutor`, here)}>
                      <MessageSquare className='h-4 w-4' /> Feedback
                    </Link>
                  </Button>
                  {!lessonCanceled && (
                    <Button
                      variant='outline'
                      className='border-destructive/50 text-destructive hover:text-destructive'
                      onClick={() => {
                        setCancelLessonCountsForTutor(Boolean(lesson.countsForTutor))
                        setCancelLessonOpen(true)
                      }}
                    >
                      <XCircle className='h-4 w-4' /> Annulla lezione
                    </Button>
                  )}
                </>
              )}
            />
          )}

          {lesson && (
            <section className='space-y-3 rounded-lg border bg-card p-4 sm:p-6'>
              <h2 className='text-lg font-semibold'>Tutor</h2>
              {tutorLoading && !tutor ? (
                <Skeleton className='h-12' />
              ) : tutor ? (
                <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='space-y-1'>
                    <Link className='font-medium text-[var(--primary-text)] hover:underline' href={withFrom(`/admin/tutors/${tutor.id}`, here)}>
                      {tutor.firstName} {tutor.lastName}
                    </Link>
                    {tutorClassLabel(tutor) && <div className='text-sm text-muted-foreground'>{tutorClassLabel(tutor)}</div>}
                    <div className='text-sm text-muted-foreground'>Posti del giorno: {lessonDailySeatsLabel(lesson)}</div>
                    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                      Lezione conteggiata per il tutor:
                      <Badge variant={countsBadgeVariant(lesson.countsForTutor)}>{countsBadgeLabel(lesson.countsForTutor)}</Badge>
                    </div>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {tutor.email && (
                      <Button asChild variant='outline' size='sm'>
                        <a href={`mailto:${tutor.email}`}><Mail className='h-4 w-4' /> Scrivi</a>
                      </Button>
                    )}
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setLessonCountsValue(Boolean(lesson.countsForTutor))
                        setLessonCountsOpen(true)
                      }}
                    >
                      Modifica conteggio
                    </Button>
                  </div>
                </div>
              ) : (
                <p className='text-sm text-muted-foreground'>Tutor non trovato.</p>
              )}
            </section>
          )}

          <section className='space-y-3'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <h2 className='text-lg font-semibold'>Studenti</h2>
              <SegmentedTabs
                label='Prenotazioni'
                value={bookingFilter}
                onValueChange={(value) => setBookingFilter(value as typeof bookingFilter)}
                options={[{ value: 'confirmed', label: 'Confermate' }, { value: 'canceled', label: 'Annullate' }, { value: 'all', label: 'Tutte' }]}
              />
            </div>
            {bookingsLoading ? (
              <Skeleton className='h-24' />
            ) : filteredBookings.length === 0 ? (
              <EmptyState>
                {bookingFilter === 'canceled' ? 'Nessuna prenotazione annullata.' : 'Nessuno ha prenotato questa lezione.'}
              </EmptyState>
            ) : (
              filteredBookings.map((booking) => {
                const student = studentMap.get(booking.studentId)
                const bookingCanceled = isCanceledBooking(booking.status)
                const locked = bookingCanceled || lessonCanceled
                const isSaving = Boolean(presenceSaving[booking.id])
                return (
                  <div key={booking.id} className={cn('space-y-3 rounded-lg border bg-card p-4', bookingCanceled && 'opacity-70')}>
                    <div className='flex items-start justify-between gap-2'>
                      <div className='min-w-0'>
                        {student ? (
                          <Link className='inline-flex items-center gap-1 font-medium text-[var(--primary-text)] hover:underline' href={withFrom(`/admin/students/${student.id}`, here)}>
                            {studentLabel(student)}
                          </Link>
                        ) : (
                          <span className='text-muted-foreground'>Caricamento...</span>
                        )}
                        {studentClassLabel(student) && <div className='text-sm text-muted-foreground'>{studentClassLabel(student)}</div>}
                      </div>
                      <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
                        {bookingCanceled && <Badge variant='outline'>{formatBookingStatus(booking.status)}</Badge>}
                        <Badge variant={countsBadgeVariant(booking.countsForStudent)}>Ora: {countsBadgeLabel(booking.countsForStudent).toLowerCase()}</Badge>
                        {student?.email && (
                          <Button asChild size='sm' variant='outline'>
                            <a href={`mailto:${student.email}`}><Mail className='h-4 w-4' /> Scrivi</a>
                          </Button>
                        )}
                        <DropdownMenu
                          open={selectedBooking?.id === booking.id}
                          onOpenChange={(open) => setSelectedBooking(open ? booking : null)}
                        >
                          <DropdownMenuTrigger asChild>
                            <Button variant='ghost' size='icon' className='h-8 w-8' aria-label='Altre azioni'>
                              <MoreHorizontal className='h-4 w-4' />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <DropdownMenuItem onSelect={() => handleOpenTopicDialog(booking)}>Modifica argomento</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleOpenCountsDialog(booking)}>Modifica conteggio ora</DropdownMenuItem>
                            {!locked && (
                              <DropdownMenuItem className='text-destructive' onSelect={() => handleOpenCancelDialog(booking)}>
                                Annulla prenotazione
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {(booking.topic || !locked) && (
                      // The topic stretches down to the presence buttons, its text staying at the top.
                      <div className='flex flex-col gap-4 sm:flex-row sm:items-stretch'>
                        <div className='flex min-w-0 flex-1 flex-col'>
                          {booking.topic && <p className='flex-1 rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap'>{booking.topic}</p>}
                        </div>
                        {!locked && (
                          <PresenceButtons
                            value={booking.studentPresence}
                            disabled={isSaving}
                            onPresent={() => presence.ask({ studentName: studentLabel(student) ?? 'lo studente', present: booking.studentPresence === true ? null : true, run: () => handlePresenceSave(booking, booking.studentPresence === true ? null : true) })}
                            onAbsent={() => presence.ask({ studentName: studentLabel(student) ?? 'lo studente', present: booking.studentPresence === false ? null : false, run: () => handlePresenceSave(booking, booking.studentPresence === false ? null : false) })}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </section>

          <LessonHistory lessonId={lessonId} />
        </div>
      </div>

      {presence.dialog}

      <BookStudentDialog booking={bookStudent} lesson={lesson} bookingSubjectOptions={bookingSubjectOptions} />

      <AlertDialog
        open={topicTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTopicTarget(null)
            setTopicValue('')
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifica argomento</AlertDialogTitle>
            <AlertDialogDescription>
              Aggiorna l&apos;argomento della prenotazione selezionata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-2'>
            <Input
              value={topicValue}
              onChange={(event) => setTopicValue(capitalizeFirst(event.target.value))}
              placeholder="Inserisci l'argomento"
            />
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleTopicUpdate()
              }}
              disabled={isUpdatingTopic}
            >
              {isUpdatingTopic ? 'Salvataggio...' : 'Salva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Annulla prenotazione</AlertDialogTitle>
            <AlertDialogDescription>
              Confermi l&apos;annullamento della prenotazione selezionata?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelTarget && (
            <div className='rounded-md border p-3 text-sm text-muted-foreground space-y-1'>
              <div>
                Studente:{' '}
                {studentMap.get(cancelTarget.studentId)
                  ? studentLabel(studentMap.get(cancelTarget.studentId)!)
                  : 'Caricamento...'}
              </div>
              <div>
                Lezione:{' '}
                {lesson ? formatItalianDate(lesson.startAt) : 'Caricamento...'}
              </div>
              <div>Tutor: {tutorLabel(tutor) ?? '-'}</div>
              <div>Materia: {subjectLabel}</div>
              <div>Argomento: {cancelTarget.topic || '-'}</div>
              <div>Stato: {formatBookingStatus(cancelTarget.status)}</div>
            </div>
          )}
          <div className='flex items-center gap-3'>
            <Checkbox
              id='cancel-counts-student'
              checked={cancelCountsForStudent}
              onCheckedChange={(value) =>
                setCancelCountsForStudent(Boolean(value))
              }
            />
            <Label htmlFor='cancel-counts-student'>
              Conteggia per lo studente
            </Label>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleCancelBooking()
              }}
              disabled={isCanceling}
            >
              {isCanceling ? 'Annullamento...' : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelLessonOpen}
        onOpenChange={(open) => {
          setCancelLessonOpen(open)
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Annulla lezione</AlertDialogTitle>
            <AlertDialogDescription>
              Confermi l&apos;annullamento della lezione selezionata?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {lesson && (
            <div className='rounded-md border p-3 text-sm text-muted-foreground space-y-1'>
              <div>Data: {formatItalianDate(lesson.startAt)}</div>
              <div>Tutor: {tutorLabel(tutor) ?? '-'}</div>
              <div>Materia: {subjectLabel}</div>
              <div>
                Posti occupati: {lessonOccupiedSeats(lesson)}/
                {lesson.lessonCapacity}
              </div>
            </div>
          )}
          <div className='flex items-center gap-3'>
            <Checkbox
              id='cancel-lesson-counts-tutor'
              checked={cancelLessonCountsForTutor}
              onCheckedChange={(value) =>
                setCancelLessonCountsForTutor(Boolean(value))
              }
            />
            <Label htmlFor='cancel-lesson-counts-tutor'>
              Conteggia per il tutor
            </Label>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleCancelLesson()
              }}
              disabled={isCancellingLesson}
            >
              {isCancellingLesson ? 'Annullamento...' : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={countsTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCountsTarget(null)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifica conteggio</AlertDialogTitle>
            <AlertDialogDescription>
              Imposta se la prenotazione deve essere conteggiata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex items-center gap-3'>
            <Checkbox
              id='booking-counts-student'
              checked={countsValue}
              onCheckedChange={(value) => setCountsValue(Boolean(value))}
            />
            <Label htmlFor='booking-counts-student'>
              Conteggia per lo studente
            </Label>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleUpdateCounts()
              }}
              disabled={isUpdatingCounts}
            >
              {isUpdatingCounts ? 'Salvataggio...' : 'Salva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={lessonCountsOpen}
        onOpenChange={(open) => {
          if (!open) {
            setLessonCountsOpen(false)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Conteggio tutor</AlertDialogTitle>
            <AlertDialogDescription>
              Imposta se la lezione deve essere conteggiata per il tutor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex items-center gap-3'>
            <Checkbox
              id='lesson-counts-tutor'
              checked={lessonCountsValue}
              onCheckedChange={(value) => setLessonCountsValue(Boolean(value))}
            />
            <Label htmlFor='lesson-counts-tutor'>Conteggia per il tutor</Label>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleUpdateLessonCounts()
              }}
              disabled={isUpdatingLessonCounts}
            >
              {isUpdatingLessonCounts ? 'Salvataggio...' : 'Salva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RescheduleLessonDialog reschedule={reschedule} lesson={lesson} />
    </main>
  )
}
