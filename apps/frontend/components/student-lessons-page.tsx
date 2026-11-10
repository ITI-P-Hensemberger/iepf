'use client'

// "Le mie lezioni": what is coming, what took place (with feedback) and what was canceled,
// grouped by day. The tab and the subject live in the URL.
import { SegmentedTabs } from '@/components/segmented-tabs'
import { SEARCH_DELAY, SearchField } from '@/components/search-field'
import { StickyBar } from '@/components/sticky-bar'
import { EmptyState } from '@/components/empty-state'
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { LessonHoursBadge } from '@/components/lesson-hours-badge'
import {
  CancelBookingDialog,
  FeedbackDialog,
  lessonDayLabel,
  StudentLessonCard,
  type StudentLesson,
  useStudentFeedback
} from '@/components/student-lesson-ui'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { extractPayloadArray } from '@/lib/backend-response'
import { groupBy } from '@/lib/lesson-schedule'
import { dayKeyOf } from '@/lib/school-week'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/use-session'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import { useChatUnread, useOpenChat } from '@/components/lesson-chat'

type Tab = 'upcoming' | 'past' | 'canceled'

const TABS: Array<{ key: Tab, label: string }> = [
  { key: 'upcoming', label: 'In programma' },
  { key: 'past', label: 'Passate' },
  { key: 'canceled', label: 'Annullate' }
]

const PAGE = 30

function query(tab: Tab, offset: number, q: string) {
  const now = new Date().toISOString()
  const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
  if (q.trim()) params.set('q', q.trim())
  if (tab === 'upcoming') {
    params.set('bookingStatus', 'confirmed')
    params.set('from', now)
    params.set('sortDir', 'asc')
  }
  else if (tab === 'past') {
    params.set('bookingStatus', 'confirmed')
    params.set('to', now)
    params.set('sortDir', 'desc')
  }
  else {
    params.set('bookingStatus', 'canceled')
    params.set('sortDir', 'desc')
  }
  return params
}

const noLessons: StudentLesson[] = []

export default function StudentLessonsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { profile, refresh } = useSession()
  const tab: Tab = (['past', 'canceled'] as const).find((key) => key === searchParams.get('tab')) ?? 'upcoming'
  const subjectId = searchParams.get('subject') ?? ''
  const q = searchParams.get('q') ?? ''
  const [search, setSearch] = React.useState(q)

  const [cancelTarget, setCancelTarget] = React.useState<StudentLesson | null>(null)
  const [feedbackTarget, setFeedbackTarget] = React.useState<StudentLesson | null>(null)
  const feedback = useStudentFeedback()
  const unread = useChatUnread()
  const openChat = useOpenChat()

  // PAGE lessons at a time; "Mostra altre" asks for the next ones. A new tab or search keeps
  // the rows on screen until its own arrive.
  const lessonsQuery = useInfiniteQuery({
    queryKey: ['lessons', 'me', tab, q],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => extractPayloadArray<StudentLesson>(
      await apiFetch(`/api/lessons/me?${query(tab, pageParam, q)}`, 'Impossibile caricare le lezioni.')
    ),
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.flat().length : undefined),
    placeholderData: keepPreviousData
  })
  const lessons = lessonsQuery.data?.pages.flat() ?? noLessons
  const loading = lessonsQuery.isPending
  // Another tab's or search's rows, shown dimmed until the new ones arrive.
  const stale = lessonsQuery.isPlaceholderData
  const loadingMore = lessonsQuery.isFetchingNextPage
  const hasMore = lessonsQuery.hasNextPage

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }

  // The search reaches the URL (and the list) a moment after the last key.
  React.useEffect(() => {
    if (search === q) return
    const timer = window.setTimeout(() => setParam('q', search), SEARCH_DELAY)
    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, q])

  const subjects = [...new Map(lessons.map((lesson) => [lesson.subjectId, lesson.subjectName])).entries()]
    .sort(([, a], [, b]) => a.localeCompare(b, 'it'))
  const shown = subjectId ? lessons.filter((lesson) => lesson.subjectId === subjectId) : lessons
  const days = [...groupBy(shown, (lesson) => dayKeyOf(new Date(lesson.startAt))).values()]

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-3xl'>
          <PageHeader
            title='Le mie lezioni'
            backHref='/student'
            actions={profile?.role === 'student' && <div><LessonHoursBadge tokens={profile.lessonTokens} className='text-sm' /></div>}
          />

          <StickyBar className='mt-6 space-y-3'>
            <SearchField
              id='my-lessons-search'
              value={search}
              onChange={setSearch}
              placeholder='Data, tutor, materia o argomento'
            />
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
            <SegmentedTabs
              label='Lezioni'
              stretch
              value={tab}
              onValueChange={(value) => setParam('tab', value === 'upcoming' ? '' : value)}
              options={TABS.map((item) => ({ value: item.key, label: item.label }))}
            />
            {subjects.length > 1 && (
              <div className='sm:ml-auto sm:w-56'>
                <Select value={subjectId || 'all'} onValueChange={(value) => setParam('subject', value === 'all' ? '' : value)}>
                  <SelectTrigger className='w-full' aria-label='Materia'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>Tutte le materie</SelectItem>
                    {subjects.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            </div>
          </StickyBar>

          <div className={cn('mt-6 space-y-6', stale && 'opacity-60 transition-opacity')} aria-busy={stale}>
            {loading ? (
              <>
                <Skeleton className='h-28' />
                <Skeleton className='h-28' />
              </>
            ) : days.length === 0 ? (
              <EmptyState
                action={tab === 'upcoming' && !q && (
                  <Button asChild className='w-full sm:w-auto'>
                    <Link href='/student/book'><CalendarPlus className='h-4 w-4' /> Prenota una lezione</Link>
                  </Button>
                )}
              >
                {q
                  ? 'Nessuna lezione trovata.'
                  : tab === 'upcoming'
                  ? 'Non hai lezioni in programma.'
                  : tab === 'past' ? 'Non hai ancora fatto lezioni.' : 'Nessuna prenotazione annullata.'}
              </EmptyState>
            ) : (
              days.map((dayLessons) => (
                <section key={dayLessons[0].bookingId} className='space-y-2'>
                  <h2 className='sticky top-[var(--sticky-top)] z-10 -mx-4 bg-background/95 px-4 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur'>{lessonDayLabel(dayLessons[0].startAt)}</h2>
                  {dayLessons.map((lesson) => (
                    <StudentLessonCard
                      key={lesson.bookingId}
                      lesson={lesson}
                      showDay={false}
                      feedback={feedback.byBooking.get(lesson.bookingId)}
                      onCancel={setCancelTarget}
                      onFeedback={setFeedbackTarget}
                      // Only chats that exist: open ones, or closed ones with messages.
                      onChat={unread.has(lesson.bookingId) ? (target) => openChat(target.bookingId) : undefined}
                      unread={unread.get(lesson.bookingId)}
                    />
                  ))}
                </section>
              ))
            )}
            {hasMore && (
              <Button variant='outline' className={cn('w-full', loadingMore && 'opacity-60')} disabled={loadingMore || stale} onClick={() => void lessonsQuery.fetchNextPage()}>
                {loadingMore ? 'Caricamento...' : 'Mostra altre'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <CancelBookingDialog
        lesson={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCanceled={() => {
          setCancelTarget(null)
          // The hours left change.
          void refresh()
        }}
      />
      <FeedbackDialog
        lesson={feedbackTarget}
        existing={feedbackTarget ? feedback.byBooking.get(feedbackTarget.bookingId) : undefined}
        onClose={() => setFeedbackTarget(null)}
      />
    </main>
  )
}
