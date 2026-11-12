'use client'

// The subjects students asked for since Saturday noon, when the school week turns, most requested
// first, on the tutor's home. Counts stay hidden: the order is enough. Nothing shows while loading
// or when the week has none. Past four rows the list fades out and a tap opens the rest.
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Flame } from 'lucide-react'
import * as React from 'react'

import type { ApiResponse } from '@/lib/api'
import { apiFetch } from '@/lib/api-fetch'
import { cn } from '@/lib/utils'

type RequestedSubject = ApiResponse<'/subject-requests/week'>[number]

export function WeeklyRequestedSubjects() {
  const { data } = useQuery({
    queryKey: ['subject-requests', 'week'],
    queryFn: () => apiFetch<RequestedSubject[]>('/api/subject-requests/week', 'Impossibile caricare le materie richieste.')
  })
  const listRef = React.useRef<HTMLUListElement>(null)
  const [overflows, setOverflows] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      // Four rows of pills: 1.75rem each plus three 0.375rem gaps.
      const fourRows = 4 * 28 + 3 * 6
      setOverflows(list.scrollHeight > fourRows + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [data])

  if (!data || data.length === 0) return null
  const collapsed = overflows && !open

  return (
    <section className='rounded-lg border border-primary/30 bg-primary/5 px-4 py-3'>
      <h2 className='flex items-center gap-2 text-sm font-semibold'>
        <Flame className='h-4 w-4 text-[var(--primary-text)]' aria-hidden />
        Materie richieste questa settimana
      </h2>
      <ul
        ref={listRef}
        id='weekly-requested-subjects'
        // Tapping the faded list opens it too; the button below is the accessible control.
        onClick={collapsed ? () => setOpen(true) : undefined}
        className={cn(
          'mt-2 flex flex-wrap gap-1.5',
          collapsed && 'max-h-[8.125rem] cursor-pointer overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]'
        )}
      >
        {data.map((subject) => (
          <li key={subject.subjectId} className='h-7 rounded-full border bg-card px-2.5 text-sm leading-[1.625rem]'>
            {subject.subjectName}
          </li>
        ))}
      </ul>
      {overflows && (
        <button
          type='button'
          aria-expanded={open}
          aria-controls='weekly-requested-subjects'
          onClick={() => setOpen((value) => !value)}
          className='mx-auto mt-1 flex items-center gap-1 text-sm font-medium text-[var(--primary-text)]'
        >
          {open ? 'Mostra meno' : 'Mostra tutte'}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      )}
    </section>
  )
}
