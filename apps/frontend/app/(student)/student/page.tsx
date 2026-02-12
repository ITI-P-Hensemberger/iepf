'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  BookOpen,
  Calendar,
  ChevronRight,
  ExternalLink,
  Mail,
  MessageSquare,
  XCircle
} from 'lucide-react'
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
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { extractPayloadArray } from '@/lib/backend-response'
import { formatItalianDate } from '@/lib/format-date'
import { useSession } from '@/lib/use-session'

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

type Feedback = {
  id: string
  lessonId: string
  bookingId: string
  rating: number
  text?: string | null
}

const lessonsLimit = 50

function startOfTodayIso() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

function endOfTodayIso() {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  return now.toISOString()
}

function startOfTomorrowIso() {
  const now = new Date()
  now.setHours(24, 0, 0, 0)
  return now.toISOString()
}

function isCanceled(status?: string | null) {
  if (!status) return false
  const normalized = status.toLowerCase()
  return normalized === 'canceled' || normalized === 'cancelled'
}

export default function StudentPage() {
  const { profile, isLoading: isProfileLoading } = useSession()
  const [todayLessons, setTodayLessons] = React.useState<LessonBooking[]>([])
  const [upcomingLessons, setUpcomingLessons] = React.useState<LessonBooking[]>(
    []
  )
  const [isTodayLoading, setIsTodayLoading] = React.useState(true)
  const [isUpcomingLoading, setIsUpcomingLoading] = React.useState(true)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancelTarget, setCancelTarget] = React.useState<LessonBooking | null>(
    null
  )
  const [cancelConfirm, setCancelConfirm] = React.useState(false)
  const [isCancelling, setIsCancelling] = React.useState(false)
  const [topicDialogOpen, setTopicDialogOpen] = React.useState(false)
  const [topicDialogValue, setTopicDialogValue] = React.useState('')
  const [topicDialogTutor, setTopicDialogTutor] = React.useState('')
  const [topicDialogDate, setTopicDialogDate] = React.useState('')
  const [topicDialogSubject, setTopicDialogSubject] = React.useState('')
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

  const loadTodayLessons = React.useCallback(async () => {
    setIsTodayLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('from', startOfTodayIso())
      params.set('to', endOfTodayIso())
      params.set('bookingStatus', 'confirmed')
      params.set('sortBy', 'startAt')
      params.set('sortDir', 'asc')
      params.set('limit', String(lessonsLimit))
      const response = await fetch(`/api/lessons/me?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare le lezioni odierne.')
      }
      const payload = await response.json()
      setTodayLessons(extractPayloadArray<LessonBooking>(payload))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile caricare le lezioni odierne.'
      )
      setTodayLessons([])
    } finally {
      setIsTodayLoading(false)
    }
  }, [])

  const loadUpcomingLessons = React.useCallback(async () => {
    setIsUpcomingLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('from', startOfTomorrowIso())
      params.set('bookingStatus', 'confirmed')
      params.set('sortBy', 'startAt')
      params.set('sortDir', 'asc')
      params.set('limit', String(lessonsLimit))
      const response = await fetch(`/api/lessons/me?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare le lezioni programmate.')
      }
      const payload = await response.json()
      setUpcomingLessons(extractPayloadArray<LessonBooking>(payload))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile caricare le lezioni programmate.'
      )
      setUpcomingLessons([])
    } finally {
      setIsUpcomingLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadTodayLessons()
    void loadUpcomingLessons()
  }, [loadTodayLessons, loadUpcomingLessons])

  const loadFeedback = React.useCallback(async () => {
    const params = new URLSearchParams()
    params.set('from', startOfTodayIso())
    params.set('to', endOfTodayIso())
    params.set('limit', String(lessonsLimit))
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
  }, [])

  React.useEffect(() => {
    void loadFeedback()
  }, [loadFeedback])

  const handleCancelBooking = React.useCallback(async () => {
    if (!cancelTarget) return
    setIsCancelling(true)
    try {
      const response = await fetch(
        `/api/lessons/${cancelTarget.id}/bookings/${cancelTarget.bookingId}/cancel`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        }
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message || 'Impossibile annullare la lezione.')
      }
      toast.success('Prenotazione annullata.')
      setCancelOpen(false)
      setCancelTarget(null)
      setCancelConfirm(false)
      await loadTodayLessons()
      await loadUpcomingLessons()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile annullare la lezione.'
      )
    } finally {
      setIsCancelling(false)
    }
  }, [cancelTarget, loadTodayLessons, loadUpcomingLessons])

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
      <div className='container mx-auto px-4 py-10'>
        <div className='max-w-6xl mx-auto'>
          <h1 className='text-2xl font-bold mb-2'>
            {!isProfileLoading && `Bentornatə, ${profile?.firstName}`}
          </h1>
          <p className='text-muted-foreground mb-8'>
            Questa è la tua area studente.
          </p>
          <div className='grid gap-4 sm:gap-6 md:grid-cols-2'>
            <Link href='/student/book/' className='group block'>
              <Card className='border py-4 sm:py-6'>
                <CardContent>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                      <div className='rounded-lg bg-primary/10 p-2.5'>
                        <Calendar className='h-4 w-4 text-primary' />
                      </div>
                      <div>
                        <CardTitle className='text-md'>
                          Prenota lezioni
                        </CardTitle>
                      </div>
                    </div>
                    <ChevronRight className='h-5 w-5 text-muted-foreground' />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href='/student/lessons/' className='group block'>
              <Card className='border py-4 sm:py-6'>
                <CardContent>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                      <div className='rounded-lg bg-primary/10 p-2.5'>
                        <BookOpen className='h-4 w-4 text-primary' />
                      </div>
                      <div>
                        <CardTitle className='text-md'>
                          Storico lezioni
                        </CardTitle>
                      </div>
                    </div>
                    <ChevronRight className='h-5 w-5 text-muted-foreground' />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          <div className='mt-10 space-y-10'>
            <section>
              <div className='flex items-center justify-between'>
                <h2 className='text-xl font-semibold'>Lezioni odierne</h2>
                <Badge variant='secondary'>Oggi</Badge>
              </div>
              <div className='mt-4 rounded-lg border'>
                <Table>
                  <TableHeader className='bg-muted/50'>
                    <TableRow>
                      <TableHead className='whitespace-nowrap'>
                        Data e ora
                      </TableHead>
                      <TableHead>Materia</TableHead>
                      <TableHead>Tutor</TableHead>
                      <TableHead>Argomento</TableHead>
                      <TableHead className='w-36'>
                        <span className='sr-only'>Azioni</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isTodayLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground'
                        >
                          Caricamento...
                        </TableCell>
                      </TableRow>
                    ) : todayLessons.length ? (
                      todayLessons.map((lesson) => {
                        const isDisabled =
                          isCanceled(lesson.bookingStatus) ||
                          isCanceled(lesson.lessonStatus)
                        const startTime = Date.parse(lesson.startAt)
                        const isPastStart =
                          Number.isFinite(startTime) &&
                          Date.now() > startTime
                        const feedbackReady =
                          Number.isFinite(startTime) &&
                          Date.now() >= startTime + 60 * 60 * 1000
                        const canCancel = !isPastStart && !isDisabled
                        const canFeedback =
                          lesson.studentPresence === true && feedbackReady
                        const existingFeedback = feedbackByBooking.get(
                          lesson.bookingId
                        )
                        const tutorEmail = lesson.tutorEmail?.trim() ?? ''
                        return (
                          <TableRow key={lesson.bookingId}>
                            <TableCell>
                              {formatItalianDate(lesson.startAt)}
                            </TableCell>
                            <TableCell>{lesson.subjectName || '-'}</TableCell>
                            <TableCell>
                              <div className='flex flex-wrap items-center gap-2'>
                                <span className='min-w-0 mr-2'>
                                  {lesson.tutorLastName} {lesson.tutorFirstName}
                                </span>
                                {tutorEmail ? (
                                  <Button asChild size='sm' variant='outline'>
                                    <a href={`mailto:${tutorEmail}`}>
                                      Contatta
                                      <Mail className='h-4 w-4' />
                                    </a>
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              {lesson.topic ? (
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  className='h-auto w-full justify-start gap-2 px-0 text-left text-sm font-normal'
                                  onClick={() => {
                                    setTopicDialogValue(lesson.topic || '-')
                                    setTopicDialogTutor(
                                      `${lesson.tutorLastName} ${lesson.tutorFirstName}`.trim()
                                    )
                                    setTopicDialogDate(
                                      formatItalianDate(lesson.startAt)
                                    )
                                    setTopicDialogSubject(
                                      lesson.subjectName || '-'
                                    )
                                    setTopicDialogOpen(true)
                                  }}
                                >
                                  <span>
                                    {lesson.topic.length > 15
                                      ? `${lesson.topic.slice(0, 15)}...`
                                      : lesson.topic}
                                  </span>
                                  <ExternalLink className='h-4 w-4 shrink-0 text-muted-foreground' />
                                </Button>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className='text-right'>
                              <div className='flex flex-wrap justify-end gap-2'>
                                {canCancel && (
                                  <Button
                                    variant='destructive'
                                    size='sm'
                                    disabled={isDisabled}
                                    onClick={() => {
                                      setCancelTarget(lesson)
                                      setCancelConfirm(false)
                                      setCancelOpen(true)
                                    }}
                                  >
                                    <XCircle className='mr-2 h-4 w-4' />
                                    Annulla
                                  </Button>
                                )}
                                {canFeedback && (
                                  <Button
                                    variant='ghost'
                                    size='sm'
                                    className='h-7 gap-2 px-2'
                                    aria-label='Lascia feedback'
                                    onClick={() => {
                                      setFeedbackTarget(lesson)
                                      setFeedbackRating(
                                        existingFeedback?.rating ?? 5
                                      )
                                      setFeedbackText(
                                        existingFeedback?.text ?? ''
                                      )
                                      setFeedbackReadonly(
                                        Boolean(existingFeedback)
                                      )
                                      setFeedbackOpen(true)
                                    }}
                                  >
                                    <MessageSquare className='h-4 w-4' />
                                    <span>
                                      {existingFeedback
                                        ? 'Vedi feedback'
                                        : 'Lascia feedback'}
                                    </span>
                                  </Button>
                                )}
                                {!canCancel && !canFeedback ? null : null}
                              </div>
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
                          Nessuna lezione oggi.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section>
              <div className='flex items-center justify-between'>
                <h2 className='text-xl font-semibold'>Lezioni programmate</h2>
              </div>
              <div className='mt-4 rounded-lg border'>
                <Table>
                  <TableHeader className='bg-muted/50'>
                    <TableRow>
                      <TableHead className='whitespace-nowrap'>
                        Data e ora
                      </TableHead>
                      <TableHead>Materia</TableHead>
                      <TableHead>Tutor</TableHead>
                      <TableHead>Argomento</TableHead>
                      <TableHead className='w-36'>
                        <span className='sr-only'>Azioni</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isUpcomingLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground'
                        >
                          Caricamento...
                        </TableCell>
                      </TableRow>
                    ) : upcomingLessons.length ? (
                      upcomingLessons.map((lesson) => {
                        const isDisabled =
                          isCanceled(lesson.bookingStatus) ||
                          isCanceled(lesson.lessonStatus)
                        const tutorEmail = lesson.tutorEmail?.trim() ?? ''
                        return (
                          <TableRow key={lesson.bookingId}>
                            <TableCell>
                              {formatItalianDate(lesson.startAt)}
                            </TableCell>
                            <TableCell>{lesson.subjectName || '-'}</TableCell>
                            <TableCell>
                              <div className='flex flex-wrap items-center gap-2'>
                                <span className='min-w-0 mr-2'>
                                  {lesson.tutorLastName} {lesson.tutorFirstName}
                                </span>
                                {tutorEmail ? (
                                  <Button asChild size='sm' variant='outline'>
                                    <a href={`mailto:${tutorEmail}`}>
                                      Contatta
                                      <Mail className='h-4 w-4' />
                                    </a>
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              {lesson.topic ? (
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  className='h-auto w-full justify-start gap-2 px-0 text-left text-sm font-normal'
                                  onClick={() => {
                                    setTopicDialogValue(lesson.topic || '-')
                                    setTopicDialogTutor(
                                      `${lesson.tutorLastName} ${lesson.tutorFirstName}`.trim()
                                    )
                                    setTopicDialogDate(
                                      formatItalianDate(lesson.startAt)
                                    )
                                    setTopicDialogSubject(
                                      lesson.subjectName || '-'
                                    )
                                    setTopicDialogOpen(true)
                                  }}
                                >
                                  <span>
                                    {lesson.topic.length > 15
                                      ? `${lesson.topic.slice(0, 15)}...`
                                      : lesson.topic}
                                  </span>
                                  <ExternalLink className='h-4 w-4 shrink-0 text-muted-foreground' />
                                </Button>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className='text-right'>
                              <div className='flex flex-wrap justify-end gap-2'>
                                <Button
                                  variant='destructive'
                                  size='sm'
                                  disabled={isDisabled}
                                  onClick={() => {
                                    setCancelTarget(lesson)
                                    setCancelConfirm(false)
                                    setCancelOpen(true)
                                  }}
                                >
                                  <XCircle className='mr-2 h-4 w-4' />
                                  Annulla
                                </Button>
                              </div>
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
                          Nessuna lezione programmata.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        </div>
      </div>

      <AlertDialog open={topicDialogOpen} onOpenChange={setTopicDialogOpen}>
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

      <AlertDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCancelOpen(false)
            setCancelTarget(null)
            setCancelConfirm(false)
            return
          }
          setCancelOpen(true)
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Annulla prenotazione</AlertDialogTitle>
            <AlertDialogDescription>
              Se annulli dopo le ore 20 del giorno prima della lezione,
              l&apos;ora non verrà rimborsata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelTarget && (
            <div className='space-y-2 text-sm text-muted-foreground'>
              <div>Data: {formatItalianDate(cancelTarget.startAt)}</div>
              <div>Materia: {cancelTarget.subjectName || '-'}</div>
              <div>
                Tutor: {cancelTarget.tutorLastName}{' '}
                {cancelTarget.tutorFirstName}
              </div>
              <div>Argomento: {cancelTarget.topic || '-'}</div>
            </div>
          )}
          <div className='flex items-start gap-2 pt-2'>
            <Checkbox
              id='cancel-confirm'
              checked={cancelConfirm}
              onCheckedChange={(value) => {
                setCancelConfirm(Boolean(value))
              }}
            />
            <label
              htmlFor='cancel-confirm'
              className='text-sm text-muted-foreground'
            >
              Confermo di aver letto l&apos;avviso sul rimborso.
            </label>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleCancelBooking()
              }}
              disabled={!cancelConfirm || isCancelling}
            >
              {isCancelling ? 'Annullamento...' : 'Conferma annullamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
