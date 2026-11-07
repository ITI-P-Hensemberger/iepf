'use client'

import { SegmentedTabs } from '@/components/segmented-tabs'
import * as React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { useHere, withFrom } from '@/lib/back-link'
import { StatusBadge, type StudentLesson } from '@/components/student-lesson-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { extractPayloadArray } from '@/lib/backend-response'
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
  const [rows, setRows] = React.useState<Row[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const subjects = React.useRef<Map<string, string> | null>(null)

  const load = React.useCallback(async (offset: number) => {
    setLoading(true)
    setError(false)
    try {
      const now = new Date().toISOString()
      const params = new URLSearchParams({
        limit: String(PAGE),
        offset: String(offset),
        sortBy: 'startAt',
        sortDir: when === 'past' ? 'desc' : 'asc',
        [when === 'past' ? 'to' : 'from']: now
      })
      let next: Row[]
      let count: number
      if (role === 'student') {
        params.set('studentId', userId)
        const response = await fetch(`/api/lessons/me?${params}`)
        if (!response.ok) throw new Error()
        const payload = await response.json()
        const items = extractPayloadArray<StudentLesson>(payload)
        count = Number(payload?.total ?? items.length)
        next = items.map(lesson => ({
          id: lesson.id,
          startAt: lesson.startAt,
          title: lesson.subjectName,
          detail: [`${lesson.tutorFirstName} ${lesson.tutorLastName}`, lesson.topic].filter(Boolean).join(' · '),
          badge: <StatusBadge lesson={lesson} />
        }))
      } else {
        params.set('tutorId', userId)
        if (!subjects.current) {
          const response = await fetch('/api/subjects')
          const list = response.ok ? extractPayloadArray<{ id: string, name: string }>(await response.json()) : []
          subjects.current = new Map(list.map(subject => [subject.id, subject.name]))
        }
        const response = await fetch(`/api/lessons?${params}`)
        if (!response.ok) throw new Error()
        const payload = await response.json()
        const items = extractPayloadArray<TutorLesson>(payload)
        count = Number(payload?.total ?? items.length)
        next = items.map(lesson => ({
          id: lesson.id,
          startAt: lesson.startAt,
          title: (lesson.subjectId && subjects.current?.get(lesson.subjectId)) || 'Materia non ancora scelta',
          detail: '',
          badge: tutorBadge(lesson, when)
        }))
      }
      setRows(previous => offset === 0 ? next : [...previous, ...next])
      setTotal(count)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [role, userId, when])

  React.useEffect(() => {
    void load(0)
  }, [load])

  const pastLabel = role === 'tutor' ? 'Svolte' : 'Passate'

  return (
    <section className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <SegmentedTabs
          label='Periodo'
          value={when}
          onValueChange={(value) => setWhen(value as When)}
          options={[{ value: 'past', label: pastLabel }, { value: 'upcoming', label: 'In programma' }]}
        />
        {!loading && !error && (
          <span className='text-sm text-muted-foreground'>
            {total} {total === 1 ? 'lezione' : 'lezioni'}
          </span>
        )}
      </div>

      {error ? (
        <EmptyState
          action={<Button variant='outline' size='sm' onClick={() => void load(0)}>Riprova</Button>}
        >
          Impossibile caricare le lezioni.
        </EmptyState>
      ) : loading && rows.length === 0 ? (
        <div className='space-y-2'>
          <Skeleton className='h-16' />
          <Skeleton className='h-16' />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState>
          {when === 'past'
            ? role === 'tutor' ? 'Nessuna lezione svolta.' : 'Nessuna lezione a cui ha partecipato.'
            : 'Nessuna lezione in programma.'}
        </EmptyState>
      ) : (
        <>
          <ul className='divide-y rounded-lg border bg-card'>
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
            <Button variant='outline' className='w-full sm:w-auto' disabled={loading} onClick={() => void load(rows.length)}>
              {loading ? 'Caricamento...' : 'Mostra altre'}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
