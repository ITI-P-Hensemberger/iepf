'use client'

import { SegmentedTabs } from '@/components/segmented-tabs'
import * as React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { SEARCH_DELAY, SearchField } from '@/components/search-field'
import { useHere, withFrom } from '@/lib/back-link'
import { StatusBadge, type StudentLesson } from '@/components/student-lesson-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { extractPayloadArray } from '@/lib/backend-response'
import { apiFetch } from '@/lib/api-fetch'
import { cn } from '@/lib/utils'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { formatItalianDate } from '@/lib/format-date'

const PAGE = 20

type When = 'past' | 'upcoming'

type TutorLesson = {
  id: string
  subjectId: string | null
  startAt: string
  lessonCapacity: number
  availableSeats: number
  status: string
}

type Row = { id: string, startAt: string, title: string, detail: string, badge: React.ReactNode }

function tutorBadge(lesson: TutorLesson, when: When) {
  if (lesson.status === 'canceled') return <Badge variant='destructive'>Annullata</Badge>
  const booked = Math.max(0, lesson.lessonCapacity - lesson.availableSeats)
  return (
    <Badge variant={booked > 0 ? 'secondary' : 'outline'}>
      {booked}/{lesson.lessonCapacity} {when === 'past' ? 'studenti' : 'prenotati'}
    </Badge>
  )
}

// Every lesson a tutor taught or a student booked, newest first, each a click away from its
// details: the "Lezioni" section of the user's page in the admin area.
export function AdminUserLessons({ role, userId }: { role: 'tutor' | 'student', userId: string }) {
  const here = useHere()
  const [when, setWhen] = React.useState<When>('past')
  const [search, setSearch] = React.useState('')
  const [q, setQ] = React.useState('')
  React.useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), SEARCH_DELAY)
    return () => window.clearTimeout(timer)
  }, [search])
  const { data: subjectList } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => extractPayloadArray<{ id: string, name: string }>(await apiFetch('/api/subjects', 'Impossibile caricare le materie.')),
    enabled: role === 'tutor'
  })
  const subjectNames = new Map((subjectList ?? []).map(subject => [subject.id, subject.name]))

  // PAGE lessons at a time; "Mostra altre" asks for the next ones.
  const lessons = useInfiniteQuery({
    queryKey: ['lessons', role, userId, when, q],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        limit: String(PAGE),
        offset: String(pageParam),
        sortBy: 'startAt',
        sortDir: when === 'past' ? 'desc' : 'asc',
        [when === 'past' ? 'to' : 'from']: new Date().toISOString()
      })
      if (q) params.set('q', q)
      params.set(role === 'student' ? 'studentId' : 'tutorId', userId)
      const payload = await apiFetch<{ total?: number }>(
        `${role === 'student' ? '/api/lessons/me' : '/api/lessons'}?${params}`,
        'Impossibile caricare le lezioni.'
      )
      const items = extractPayloadArray<StudentLesson & TutorLesson>(payload)
      return { items, total: Number(payload?.total ?? items.length), offset: pageParam }
    },
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
    // Another period or search keeps these rows on screen, dimmed, until the new ones arrive.
    placeholderData: keepPreviousData,
    meta: { inline: true }
  })
  const loading = lessons.isPending
  const stale = lessons.isPlaceholderData
  const loadingMore = lessons.isFetchingNextPage
  const error = lessons.isError
  const total = lessons.data?.pages[0]?.total ?? 0
  const rows: Row[] = (lessons.data?.pages ?? []).flatMap(page => page.items).map(lesson => role === 'student'
    ? {
        id: lesson.id,
        startAt: lesson.startAt,
        title: lesson.subjectName,
        detail: [`${lesson.tutorFirstName} ${lesson.tutorLastName}`, lesson.topic].filter(Boolean).join(' · '),
        badge: <StatusBadge lesson={lesson} />
      }
    : {
        id: lesson.id,
        startAt: lesson.startAt,
        title: (lesson.subjectId && subjectNames.get(lesson.subjectId)) || 'Materia non ancora scelta',
        detail: '',
        badge: tutorBadge(lesson, when)
      })

  const pastLabel = role === 'tutor' ? 'Svolte' : 'Passate'

  return (
    <section className='space-y-4'>
      <SearchField
        id={`${role}-lessons-search`}
        value={search}
        onChange={setSearch}
        placeholder={role === 'tutor' ? 'Data, materia, studente o argomento' : 'Data, materia, tutor o argomento'}
      />
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <SegmentedTabs
          label='Periodo'
          value={when}
          onValueChange={(value) => setWhen(value as When)}
          options={[{ value: 'past', label: pastLabel }, { value: 'upcoming', label: 'In programma' }]}
        />
        {!loading && !error && !stale && (
          <span className='text-sm text-muted-foreground'>
            {total} {total === 1 ? 'lezione' : 'lezioni'}
          </span>
        )}
      </div>

      {error ? (
        <EmptyState
          action={<Button variant='outline' size='sm' onClick={() => void lessons.refetch()}>Riprova</Button>}
        >
          Impossibile caricare le lezioni.
        </EmptyState>
      ) : loading ? (
        <div className='space-y-2'>
          <Skeleton className='h-16' />
          <Skeleton className='h-16' />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState>
          {q
            ? 'Nessuna lezione trovata.'
            : when === 'past'
            ? role === 'tutor' ? 'Nessuna lezione svolta.' : 'Nessuna lezione a cui ha partecipato.'
            : 'Nessuna lezione in programma.'}
        </EmptyState>
      ) : (
        <>
          <ul className={cn('divide-y rounded-lg border bg-card', stale && 'opacity-60 transition-opacity')} aria-busy={stale}>
            {rows.map(row => (
              <li key={`${row.id}-${row.startAt}`}>
                <Link
                  href={withFrom(`/admin/lessons/${row.id}`, here)}
                  className='flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                      <span className='font-medium'>{row.title}</span>
                      {row.badge}
                    </div>
                    <div className='mt-0.5 truncate text-sm text-muted-foreground'>
                      {[formatItalianDate(row.startAt), row.detail].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <ChevronRight className='size-4 shrink-0 text-muted-foreground' aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {rows.length < total && (
            <Button variant='outline' className='w-full sm:w-auto' disabled={loadingMore || stale} onClick={() => void lessons.fetchNextPage()}>
              {loadingMore ? 'Caricamento...' : 'Mostra altre'}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
