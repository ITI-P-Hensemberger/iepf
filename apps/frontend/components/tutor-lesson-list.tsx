'use client'

// A tutor's lessons of one day: who booked and what for, presence while the lesson runs, and
// cancelling a slot nobody booked. Used by the week view and the home.
import { useHere, withFrom } from '@/lib/back-link'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, XCircle } from 'lucide-react'
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
import { PresenceButtons } from '@/components/presence-buttons'
import { usePresenceConfirm } from '@/components/presence-confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  canMarkPresence,
  isCanceled,
  subjectLabel,
  type ScheduleBooking,
  type ScheduleLesson
} from '@/lib/lesson-schedule'
import { cn } from '@/lib/utils'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, jsonBody } from '@/lib/api-fetch'

const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// After a presence or a cancellation the lessons reload in place.
export function TutorLessonList({ lessons }: { lessons: ScheduleLesson[] }) {
  const queryClient = useQueryClient()
  const [cancelTarget, setCancelTarget] = React.useState<ScheduleLesson | null>(null)

  const presence = usePresenceConfirm()

  // Pressing the mark already set takes it back; either way the tutor confirms first.
  const savePresence = (lesson: ScheduleLesson, booking: ScheduleBooking, present: boolean) => {
    const next = booking.studentPresence === present ? null : present
    presence.ask({ studentName: booking.studentName, present: next, run: () => writePresence(lesson, booking, next) })
  }

  const reloadLessons = () => queryClient.invalidateQueries({ queryKey: ['lessons'] })

  const presenceMutation = useMutation({
    mutationFn: ({ lesson, booking, present }: { lesson: ScheduleLesson, booking: ScheduleBooking, present: boolean | null }) =>
      apiFetch(`/api/lessons/${lesson.id}/bookings/${booking.id}/presence`, 'Impossibile aggiornare la presenza.', jsonBody('PATCH', { present })),
    onSuccess: reloadLessons
  })
  const saving = presenceMutation.isPending ? presenceMutation.variables?.booking.id ?? null : null
  const writePresence = (lesson: ScheduleLesson, booking: ScheduleBooking, present: boolean | null) =>
    presenceMutation.mutateAsync({ lesson, booking, present }).then(() => {}, () => {})

  const cancelMutation = useMutation({
    mutationFn: (lesson: ScheduleLesson) => apiFetch(`/api/lessons/${lesson.id}/cancel`, 'Impossibile annullare la lezione.', jsonBody('POST', {})),
    onSuccess: () => {
      toast.success('Lezione annullata.')
      setCancelTarget(null)
      return reloadLessons()
    }
  })
  const cancelLesson = () => {
    if (cancelTarget) cancelMutation.mutate(cancelTarget)
  }

  return (
    <>
      <ul className='divide-y'>
        {lessons.map((lesson) => (
          <TutorLessonRow
            key={lesson.id}
            lesson={lesson}
            saving={saving}
            onPresence={savePresence}
            onCancel={() => setCancelTarget(lesson)}
          />
        ))}
      </ul>
      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader className='text-left sm:text-left'>
            <AlertDialogTitle>Annullare la lezione?</AlertDialogTitle>
            <AlertDialogDescription className='text-left'>
              {cancelTarget && `${capitalize(dayFormat.format(new Date(cancelTarget.startAt)))} alle ${timeFormat.format(new Date(cancelTarget.startAt))}. `}
              Nessuno l&apos;ha prenotata: gli studenti non la vedranno più.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Indietro</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                cancelLesson()
              }}
            >
              Annulla lezione
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {presence.dialog}
    </>
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
  const router = useRouter()
  const here = useHere()
  const open = () => router.push(withFrom(`/tutor/lessons/${lesson.id}`, here))
  return (
    // The whole row opens the lesson; its buttons (presence, cancel) keep their own action.
    <li
      className={cn('cursor-pointer space-y-2 px-4 py-3 transition-colors hover:bg-muted/40', canceled && 'text-muted-foreground')}
      tabIndex={0}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a, button')) return
        open()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) open()
      }}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <span className='font-medium'>{timeFormat.format(start)}–{timeFormat.format(end)}</span>
        {lesson.subjectId && <span>· {subjectLabel(lesson)}</span>}
        {canceled ? (
          <Badge variant='outline'>Annullata</Badge>
        ) : (
          <Badge variant={count >= lesson.seats ? 'default' : 'secondary'}>{count}/{lesson.seats}</Badge>
        )}
        <span className='ml-auto flex items-center gap-1'>
          {!canceled && count === 0 && !past && (
            <Button variant='ghost' size='sm' className='text-destructive' onClick={onCancel}><XCircle className='h-4 w-4' /> Annulla</Button>
          )}
          <ChevronRight className='h-4 w-4 text-muted-foreground' aria-hidden='true' />
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
            <li key={booking.id} className='flex flex-col gap-3 rounded-md bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between'>
              <div className='min-w-0 text-sm'>
                <span className='font-medium'>{booking.studentName}</span>
                {booking.classLabel && <span className='text-muted-foreground'> · {booking.classLabel}</span>}
                <div className='text-muted-foreground'>&ldquo;{booking.topic}&rdquo;</div>
              </div>
              {presenceOpen ? (
                <PresenceButtons
                  className='shrink-0'
                  value={booking.studentPresence}
                  disabled={saving === booking.id}
                  onPresent={() => onPresence(lesson, booking, true)}
                  onAbsent={() => onPresence(lesson, booking, false)}
                />
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
