'use client'

// A student's booked lessons, the same way on the home and in "Le mie lezioni": one card per
// lesson with what the student can do next, and the dialogs to cancel or rate it.
import * as React from 'react'
import { Mail, MessageSquare, Pencil, Star, XCircle } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { extractPayloadArray } from '@/lib/backend-response'
import { cn } from '@/lib/utils'
import { capitalizeFirst } from '@/lib/capitalize'
import { FEEDBACK_LOCKED_NOTICE, FeedbackHistoryToggle } from '@/components/feedback-history'

export type StudentLesson = {
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

export type StudentFeedback = {
  id: string
  lessonId: string
  bookingId: string
  rating: number
  text?: string | null
  versionCount?: number
  lastEditorRole?: string | null
  // Until when the student may still change it (a week after the lesson).
  editableUntil?: string | null
}

const editableDateFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
const shortDayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function lessonDayLabel(startAt: string) {
  return capitalize(dayFormat.format(new Date(startAt)))
}

function isCanceledStatus(status?: string | null) {
  return status === 'canceled' || status === 'cancelled'
}

// Bookings close, and a cancellation stops being refunded, at 20:00 the day before.
export function refundDeadline(startAt: string) {
  const deadline = new Date(startAt)
  deadline.setDate(deadline.getDate() - 1)
  deadline.setHours(20, 0, 0, 0)
  return deadline
}

export function lessonActions(lesson: StudentLesson, now = new Date()) {
  const start = new Date(lesson.startAt).getTime()
  const end = start + lesson.durationMinutes * 60_000
  const canceled = isCanceledStatus(lesson.bookingStatus) || isCanceledStatus(lesson.lessonStatus)
  return {
    canceled,
    upcoming: !canceled && now.getTime() < start,
    running: !canceled && now.getTime() >= start && now.getTime() < end,
    canCancel: !canceled && now.getTime() < start && lesson.studentPresence === null,
    // The tutor marks presence during the lesson; feedback opens an hour after the start.
    canRate: !canceled && lesson.studentPresence === true && now.getTime() >= start + 60 * 60 * 1000
  }
}

function StatusBadge({ lesson }: { lesson: StudentLesson }) {
  const { canceled, upcoming, running } = lessonActions(lesson)
  if (isCanceledStatus(lesson.lessonStatus)) return <Badge variant='destructive'>Lezione annullata</Badge>
  if (canceled) return <Badge variant='outline'>Prenotazione annullata</Badge>
  if (upcoming) return <Badge variant='secondary'>Confermata</Badge>
  if (running && lesson.studentPresence === null) return <Badge>In corso</Badge>
  if (lesson.studentPresence === true) return <Badge variant='success'>Presente</Badge>
  if (lesson.studentPresence === false) return <Badge variant='destructive'>Assente</Badge>
  return <Badge variant='outline'>Presenza non segnata</Badge>
}

export function StudentLessonCard({
  lesson,
  feedback,
  showDay = true,
  highlight = false,
  onCancel,
  onFeedback
}: {
  lesson: StudentLesson
  feedback?: StudentFeedback
  showDay?: boolean
  highlight?: boolean
  onCancel: (lesson: StudentLesson) => void
  onFeedback: (lesson: StudentLesson) => void
}) {
  const start = new Date(lesson.startAt)
  const end = new Date(start.getTime() + lesson.durationMinutes * 60_000)
  const { canceled, canCancel, canRate, running } = lessonActions(lesson)
  const tutorEmail = lesson.tutorEmail?.trim()
  const showWrite = Boolean(tutorEmail) && !canceled
  const showFeedback = canRate || Boolean(feedback)
  const actionCount = [showWrite, showFeedback, canCancel].filter(Boolean).length
  const actionClass = actionCount > 1 ? 'h-auto min-h-8 flex-1 whitespace-normal sm:flex-none' : undefined
  return (
    <div className={cn('space-y-3 rounded-lg border bg-card p-4', highlight && 'border-primary', canceled && 'opacity-70')}>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <div className={cn('font-medium', highlight && 'text-lg')}>
            {showDay ? `${capitalize(shortDayFormat.format(start))} · ` : ''}
            {timeFormat.format(start)}–{timeFormat.format(end)} · {lesson.subjectName}
          </div>
          <div className='text-sm text-muted-foreground'>con {lesson.tutorFirstName} {lesson.tutorLastName}</div>
        </div>
        {/* Waiting for a feedback means the student was there: "Presente" would say nothing new. */}
        {!(canRate && !feedback) && <StatusBadge lesson={lesson} />}
      </div>
      {lesson.topic && (
        <p className='rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap'>{lesson.topic}</p>
      )}
      {running && (
        <p className='text-sm text-muted-foreground'>La lezione è iniziata: non si può più annullare.</p>
      )}
      {actionCount > 0 && (
        // On phones two actions share the row in halves, one alone keeps its size; on wider
        // screens they sit at the two ends.
        <div className='flex gap-2 sm:justify-between'>
          {showWrite && (
            <Button asChild size='sm' variant='outline' className={actionClass}>
              <a href={`mailto:${tutorEmail}`}><Mail className='h-4 w-4' /> Scrivi al tutor</a>
            </Button>
          )}
          {showFeedback && (
            <Button size='sm' variant={feedback ? 'outline' : 'default'} className={actionClass} onClick={() => onFeedback(lesson)}>
              <MessageSquare className='h-4 w-4' /> {feedback ? 'Il tuo feedback' : 'Feedback'}
            </Button>
          )}
          {canCancel && (
            <Button size='sm' variant='outline' className={cn('border-destructive/50 text-destructive hover:text-destructive', actionClass)} onClick={() => onCancel(lesson)}>
              <XCircle className='h-4 w-4' /> Annulla
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// The student's feedback, by booking.
export function useStudentFeedback() {
  const [byBooking, setByBooking] = React.useState<Map<string, StudentFeedback>>(new Map())
  const load = React.useCallback(async () => {
    try {
      const response = await fetch('/api/feedback/me?limit=200&offset=0')
      if (!response.ok) throw new Error('Impossibile caricare i feedback.')
      const items = extractPayloadArray<StudentFeedback>(await response.json())
      setByBooking(new Map(items.map((item) => [item.bookingId, item])))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile caricare i feedback.')
    }
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])
  const remember = React.useCallback((item: StudentFeedback) => {
    setByBooking((prev) => new Map(prev).set(item.bookingId, item))
  }, [])
  return { byBooking, remember }
}

export function CancelBookingDialog({
  lesson,
  onClose,
  onCanceled
}: {
  lesson: StudentLesson | null
  onClose: () => void
  onCanceled: () => void
}) {
  const [confirmed, setConfirmed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const refunded = lesson ? new Date() < refundDeadline(lesson.startAt) : true

  const cancel = async () => {
    if (!lesson) return
    setBusy(true)
    try {
      const response = await fetch(`/api/lessons/${lesson.id}/bookings/${lesson.bookingId}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || 'Impossibile annullare la prenotazione.')
      }
      toast.success('Prenotazione annullata.')
      setConfirmed(false)
      onCanceled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile annullare la prenotazione.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog
      open={lesson !== null}
      onOpenChange={(open) => {
        if (!open) {
          setConfirmed(false)
          onClose()
        }
      }}
    >
      <AlertDialogContent className='max-w-[calc(100%-2rem)] sm:max-w-lg'>
        <AlertDialogHeader className='text-left sm:text-left'>
          <AlertDialogTitle>Annullare la prenotazione?</AlertDialogTitle>
          <AlertDialogDescription className='text-left'>
            {lesson && `${lessonDayLabel(lesson.startAt)} alle ${timeFormat.format(new Date(lesson.startAt))}, ${lesson.subjectName} con ${lesson.tutorFirstName} ${lesson.tutorLastName}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {refunded ? (
          <p className='rounded-md bg-muted/50 px-3 py-2 text-sm'>Recuperi l&apos;ora di lezione: stai annullando prima delle 20:00 del giorno precedente.</p>
        ) : (
          <div className='space-y-3'>
            <p className='rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm'>
              Sono passate le 20:00 del giorno precedente: l&apos;ora di lezione resta conteggiata e non la recuperi.
            </p>
            <label className='flex items-start gap-2 text-sm'>
              <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(Boolean(value))} />
              Ho capito, annulla comunque
            </label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Indietro</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || (!refunded && !confirmed)}
            onClick={(event) => {
              event.preventDefault()
              void cancel()
            }}
          >
            {busy ? 'Annullamento...' : 'Annulla prenotazione'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function FeedbackDialog({
  lesson,
  existing,
  onClose,
  onSaved
}: {
  lesson: StudentLesson | null
  existing?: StudentFeedback
  onClose: () => void
  onSaved: (feedback: StudentFeedback) => void
}) {
  const [rating, setRating] = React.useState(5)
  const [text, setText] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const canEdit = Boolean(existing?.editableUntil && new Date() <= new Date(existing.editableUntil))
  const readonly = Boolean(existing) && !editing

  React.useEffect(() => {
    setRating(existing?.rating ?? 5)
    setText(existing?.text ?? '')
    setEditing(false)
  }, [existing, lesson])

  const save = async () => {
    if (!lesson) return
    const trimmed = text.trim()
    if (!trimmed) {
      toast.error('Scrivi com\'è andata la lezione.')
      return
    }
    setBusy(true)
    try {
      const response = existing
        ? await fetch(`/api/lessons/${lesson.id}/feedback/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating, text: trimmed })
          })
        : await fetch(`/api/lessons/${lesson.id}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: lesson.bookingId, rating, text: trimmed })
          })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || 'Impossibile salvare il feedback.')
      }
      const saved = (await response.json().catch(() => null)) as StudentFeedback | null
      toast.success(existing ? 'Feedback aggiornato.' : 'Feedback inviato.')
      if (saved?.bookingId) onSaved(saved)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile salvare il feedback.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={lesson !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className='max-w-[calc(100%-2rem)] sm:max-w-lg'>
        <AlertDialogHeader className='text-left sm:text-left'>
          <AlertDialogTitle>{readonly ? 'Il tuo feedback' : 'Com\'è andata la lezione?'}</AlertDialogTitle>
          <AlertDialogDescription className='text-left'>
            {lesson && `${lesson.subjectName} con ${lesson.tutorFirstName} ${lesson.tutorLastName}, ${lessonDayLabel(lesson.startAt).toLowerCase()}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className='space-y-3'>
          <div className='flex gap-1' role='radiogroup' aria-label='Valutazione'>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type='button'
                role='radio'
                aria-checked={rating === value}
                aria-label={`${value} su 5`}
                disabled={readonly}
                onClick={() => setRating(value)}
                className='rounded p-1 disabled:cursor-default'
              >
                <Star className={cn('h-7 w-7', value <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
              </button>
            ))}
          </div>
          <Textarea
            value={text}
            onChange={(event) => setText(capitalizeFirst(event.target.value))}
            placeholder='Cosa ti è stato utile, cosa avresti voluto diverso'
            maxLength={1000}
            rows={4}
            readOnly={readonly}
          />
          {!readonly && <div className='text-right text-xs text-muted-foreground'>{text.length}/1000</div>}
          {existing && !editing && (
            <>
              <FeedbackHistoryToggle
                feedbackId={existing.id}
                versionCount={existing.versionCount ?? 1}
                lastEditorRole={existing.lastEditorRole ?? null}
                audience='author'
                className='max-h-[40vh] overflow-y-auto'
              />
              <p className='text-xs text-muted-foreground'>
                {canEdit && existing.editableUntil
                  ? `Puoi modificarlo fino al ${editableDateFormat.format(new Date(existing.editableUntil))}.`
                  : FEEDBACK_LOCKED_NOTICE}
              </p>
            </>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Chiudi</AlertDialogCancel>
          {readonly && canEdit && (
            <Button type='button' variant='outline' onClick={() => setEditing(true)}>
              <Pencil className='h-4 w-4' /> Modifica
            </Button>
          )}
          {!readonly && (
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              {busy ? 'Salvataggio...' : existing ? 'Salva modifiche' : 'Invia'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
