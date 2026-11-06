'use client'

// The student's home: book a lesson, the next one at a glance, what is coming and what is
// waiting for a feedback.
import * as React from 'react'
import Link from 'next/link'
import { CalendarPlus, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

import { LessonHoursBadge } from '@/components/lesson-hours-badge'
import { NoHoursCard } from '@/components/no-hours-notice'
import {
  CancelBookingDialog,
  FeedbackDialog,
  lessonActions,
  StudentLessonCard,
  type StudentLesson,
  useStudentFeedback
} from '@/components/student-lesson-ui'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { extractPayloadArray } from '@/lib/backend-response'
import { hasNoHoursLeft } from '@/lib/lesson-hours'
import { useSession } from '@/lib/use-session'

const HOUR = 60 * 60 * 1000

async function fetchMyLessons(params: Record<string, string>) {
  const response = await fetch(`/api/lessons/me?${new URLSearchParams({ bookingStatus: 'confirmed', limit: '50', ...params })}`)
  if (!response.ok) throw new Error('Impossibile caricare le lezioni.')
  return extractPayloadArray<StudentLesson>(await response.json())
}

export default function StudentPage() {
  const { profile, isLoading: isProfileLoading, refresh } = useSession()
  const [upcoming, setUpcoming] = React.useState<StudentLesson[]>([])
  const [recent, setRecent] = React.useState<StudentLesson[]>([])
  const [loading, setLoading] = React.useState(true)
  const [cancelTarget, setCancelTarget] = React.useState<StudentLesson | null>(null)
  const [feedbackTarget, setFeedbackTarget] = React.useState<StudentLesson | null>(null)
  const feedback = useStudentFeedback()

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const now = Date.now()
      // A lesson under way still counts as the next one until it ends.
      const [next, past] = await Promise.all([
        fetchMyLessons({ from: new Date(now - 2 * HOUR).toISOString(), sortDir: 'asc' }),
        fetchMyLessons({ from: new Date(now - 14 * 24 * HOUR).toISOString(), to: new Date(now).toISOString(), sortDir: 'desc' })
      ])
      setUpcoming(next.filter((lesson) => new Date(lesson.startAt).getTime() + lesson.durationMinutes * 60_000 > now))
      setRecent(past)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossibile caricare le lezioni.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const [nextLesson, ...later] = upcoming
  const toRate = recent.filter((lesson) => lessonActions(lesson).canRate && !feedback.byBooking.has(lesson.bookingId))
  const tokens = profile?.lessonTokens ?? null

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-3xl space-y-8'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h1 className='text-2xl font-bold'>{!isProfileLoading && `Bentornatə, ${profile?.firstName}`}</h1>
              <p className='text-muted-foreground'>Questa è la tua area studente.</p>
            </div>
            {tokens !== null && <LessonHoursBadge tokens={tokens} className='text-sm' />}
          </div>

          {hasNoHoursLeft(tokens) ? (
            <NoHoursCard />
          ) : (
            <div className='flex flex-col gap-3 sm:flex-row'>
              <Button asChild size='lg' className='h-12 w-full text-base sm:w-auto sm:flex-1'>
                <Link href='/student/book'><CalendarPlus className='h-5 w-5' /> Prenota una lezione</Link>
              </Button>
              <Button asChild size='lg' variant='outline' className='h-12 w-full text-base sm:w-auto sm:flex-1'>
                <Link href='/student/lessons'>Le mie lezioni</Link>
              </Button>
            </div>
          )}

          {loading ? (
            <div className='space-y-3'>
              <Skeleton className='h-28' />
              <Skeleton className='h-20' />
            </div>
          ) : (
            <>
              <section className='space-y-3'>
                <h2 className='text-lg font-semibold'>La prossima lezione</h2>
                {nextLesson ? (
                  <StudentLessonCard
                    lesson={nextLesson}
                    feedback={feedback.byBooking.get(nextLesson.bookingId)}
                    highlight
                    onCancel={setCancelTarget}
                    onFeedback={setFeedbackTarget}
                  />
                ) : (
                  <p className='rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground'>
                    Non hai lezioni in programma.
                  </p>
                )}
              </section>

              {toRate.length > 0 && (
                <section className='space-y-3'>
                  <h2 className='text-lg font-semibold'>Da valutare</h2>
                  <p className='text-sm text-muted-foreground'>Raccontaci com&apos;è andata: aiuta i tutor e chi organizza.</p>
                  {toRate.map((lesson) => (
                    <StudentLessonCard
                      key={lesson.bookingId}
                      lesson={lesson}
                      onCancel={setCancelTarget}
                      onFeedback={setFeedbackTarget}
                    />
                  ))}
                </section>
              )}

              {later.length > 0 && (
                <section className='space-y-3'>
                  <div className='flex items-center justify-between'>
                    <h2 className='text-lg font-semibold'>Prossimamente</h2>
                    <Button asChild variant='ghost' size='sm'>
                      <Link href='/student/lessons'>Tutte le lezioni <ChevronRight className='h-4 w-4' /></Link>
                    </Button>
                  </div>
                  {later.slice(0, 4).map((lesson) => (
                    <StudentLessonCard
                      key={lesson.bookingId}
                      lesson={lesson}
                      feedback={feedback.byBooking.get(lesson.bookingId)}
                      onCancel={setCancelTarget}
                      onFeedback={setFeedbackTarget}
                    />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <CancelBookingDialog
        lesson={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCanceled={() => {
          setCancelTarget(null)
          void load()
          void refresh()
        }}
      />
      <FeedbackDialog
        lesson={feedbackTarget}
        existing={feedbackTarget ? feedback.byBooking.get(feedbackTarget.bookingId) : undefined}
        onClose={() => setFeedbackTarget(null)}
        onSaved={feedback.remember}
      />
    </main>
  )
}
