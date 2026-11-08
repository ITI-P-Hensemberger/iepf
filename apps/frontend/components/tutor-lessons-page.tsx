'use client'

import { DateRangePicker } from '@/components/date-picker'
import { cn } from '@/lib/utils'

import { SortableHead } from '@/components/sortable-head'
import { ListPagination } from '@/components/list-pagination'
import { TableSkeletonRows, useFirstLoad } from '@/components/loading'
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Field, FieldLabel } from '@/components/ui/field'
import { FilterForm } from '@/components/filter-form'
import { PageHeader } from '@/components/page-header'
import { useHere, withFrom } from '@/lib/back-link'
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

import { toast } from 'sonner'

import { formatItalianDate } from '@/lib/format-date'
import { lessonSubject } from '@/lib/lesson-subject'
import { type DateRange } from 'react-day-picker'

import { extractPayloadArray } from '@/lib/backend-response'
import { useSession } from '@/lib/use-session'
import { PushInviteCard } from '@/components/push-prompt'

const pageSize = 20

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
  countsForTutor?: boolean | null
  status: string
}

type Subject = {
  id: string
  name: string
}

type LessonFilters = {
  search: string
  subjectId: string
  status: string
  sortDir: 'asc' | 'desc'
  dateRange?: DateRange
}

const defaultFilters: LessonFilters = {
  search: '',
  subjectId: '',
  status: '',
  sortDir: 'desc',
  dateRange: undefined
}

function startOfDayIso(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next.toISOString()
}

function endOfDayIso(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next.toISOString()
}

function parseDateParam(value: string | null) {
  if (!value) {
    return undefined
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }
  return parsed
}

function formatStatusLabel(status?: string | null) {
  if (!status) {
    return '-'
  }
  const normalized = status.toLowerCase()
  const mapping: Record<string, string> = {
    confirmed: 'Confermata',
    canceled: 'Annullata',
    cancelled: 'Annullata',
    scheduled: 'Programmata'
  }
  return mapping[normalized] ?? 'Programmata'
}

function statusVariant(
  status?: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!status) {
    return 'secondary'
  }
  const normalized = status.toLowerCase()
  if (normalized === 'canceled' || normalized === 'cancelled') {
    return 'destructive'
  }
  if (normalized === 'confirmed') {
    return 'default'
  }
  return 'secondary'
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

function lessonOccupiedSeats(lesson?: Lesson | null) {
  if (!lesson) {
    return 0
  }
  const capacity = parseNumeric(lesson.lessonCapacity)
  const available = parseNumeric(lesson.availableSeats)
  if (capacity === null || available === null) {
    return 0
  }
  return Math.max(0, capacity - available)
}

function lessonSeatsLabel(lesson: Lesson) {
  const capacity = parseNumeric(lesson.lessonCapacity)
  const available = parseNumeric(lesson.availableSeats)
  if (capacity === null || available === null) {
    return '-'
  }
  return `${lessonOccupiedSeats(lesson)}/${capacity}`
}

function isLessonNonBookable(lesson: Lesson) {
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

export default function TutorLessonsPage({ viewSwitch }: { viewSwitch?: React.ReactNode } = {}) {
  const router = useRouter()
  const here = useHere()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()
  const { profile, isLoading: isProfileLoading } = useSession()

  const [filters, setFilters] = React.useState<LessonFilters>(defaultFilters)
  const [lessons, setLessons] = React.useState<Lesson[]>([])
  const [total, setTotal] = React.useState(0)
  const [isLoading, setIsLoading] = React.useState(true)
  const [subjects, setSubjects] = React.useState<Subject[]>([])
  const [subjectsLoading, setSubjectsLoading] = React.useState(true)


  const parsePage = React.useCallback(
    (key: string) => {
      const raw = searchParams.get(key)
      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || parsed < 1) {
        return 1
      }
      return Math.floor(parsed)
    },
    [searchParams]
  )

  const currentFilters = React.useMemo(() => {
    const fromParam = parseDateParam(searchParams.get('lessonFrom'))
    const toParam = parseDateParam(searchParams.get('lessonTo'))
    return {
      search: searchParams.get('lessonQ') ?? '',
      subjectId: searchParams.get('lessonSubject') ?? '',
      status: searchParams.get('lessonStatus') ?? '',
      sortDir: (searchParams.get('lessonSort') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
      dateRange:
        fromParam || toParam
          ? {
              from: fromParam,
              to: toParam
            }
          : undefined,
      page: parsePage('lessonPage')
    }
  }, [parsePage, searchParams])

  React.useEffect(() => {
    setFilters({
      search: currentFilters.search,
      subjectId: currentFilters.subjectId,
      status: currentFilters.status,
      sortDir: currentFilters.sortDir,
      dateRange: currentFilters.dateRange
    })
  }, [currentFilters])

  const subjectMap = React.useMemo(() => {
    const map = new Map<string, Subject>()
    subjects.forEach((subject) => map.set(subject.id, subject))
    return map
  }, [subjects])

  const sortedSubjects = React.useMemo(() => {
    return [...subjects].sort((a, b) => a.name.localeCompare(b.name))
  }, [subjects])

  const loadLessons = React.useCallback(async () => {
    setIsLoading(true)
    const params = new URLSearchParams()
    if (!profile?.id) {
      if (!isProfileLoading) {
        setLessons([])
        setTotal(0)
        setIsLoading(false)
      }
      return
    }
    params.set('tutorId', profile.id)
    if (currentFilters.subjectId) {
      params.set('subjectId', currentFilters.subjectId)
    }
    if (currentFilters.status) {
      params.set('status', currentFilters.status)
    }
    if (currentFilters.dateRange?.from) {
      params.set('from', startOfDayIso(currentFilters.dateRange.from))
    }
    if (currentFilters.dateRange?.to) {
      params.set('to', endOfDayIso(currentFilters.dateRange.to))
    }
    params.set('sortBy', 'startAt')
    // The field keeps what is typed (spaces included); the search ignores spaces at the ends.
    if (currentFilters.search.trim()) {
      params.set('q', currentFilters.search.trim())
    }
    params.set('sortDir', currentFilters.sortDir)
    params.set('limit', String(pageSize))
    params.set('offset', String((currentFilters.page - 1) * pageSize))

    try {
      const response = await fetch(`/api/lessons?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare le lezioni.')
      }
      const payload = await response.json()
      const data = payload && typeof payload === 'object' ? payload : null
      const items = Array.isArray(data?.data)
        ? (data?.data as Lesson[])
        : Array.isArray(data?.items)
          ? (data?.items as Lesson[])
          : Array.isArray(data?.results)
            ? (data?.results as Lesson[])
            : Array.isArray(data?.rows)
              ? (data?.rows as Lesson[])
              : []
      const totalValue =
        typeof data?.total === 'number'
          ? data.total
          : Array.isArray(data?.data)
            ? data.data.length
            : items.length
      setLessons(items)
      setTotal(totalValue)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile caricare le lezioni.'
      )
      setLessons([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [currentFilters, isProfileLoading, profile?.id])

  React.useEffect(() => {
    let isMounted = true

    async function loadSubjects() {
      setSubjectsLoading(true)

      try {
        const response = await fetch('/api/subjects')
        if (!response.ok) {
          throw new Error('Impossibile caricare le materie.')
        }
        const payload = await response.json()
        const items = extractPayloadArray<Subject>(payload)
        if (isMounted) {
          setSubjects(items)
        }
      } catch (err) {
        if (isMounted) {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Impossibile caricare le materie.'
          )
        }
      } finally {
        if (isMounted) {
          setSubjectsLoading(false)
        }
      }
    }

    void loadSubjects()

    return () => {
      isMounted = false
    }
  }, [])

  React.useEffect(() => {
    void loadLessons()
  }, [loadLessons])

  const appliedFilters = React.useMemo(
    () => ({
      search: currentFilters.search,
      subjectId: currentFilters.subjectId,
      status: currentFilters.status,
      sortDir: currentFilters.sortDir,
      dateRange: currentFilters.dateRange
    }),
    [currentFilters]
  )

  const updateParams = React.useCallback(
    (
      updates: Partial<LessonFilters> & { page?: number },
      base: LessonFilters = filters
    ) => {
      const params = new URLSearchParams(searchParamsString)
      const nextSearch = updates.search ?? base.search
      const nextSortDir = updates.sortDir ?? base.sortDir
      const nextSubject = updates.subjectId ?? base.subjectId
      const nextStatus = updates.status ?? base.status
      const nextRange = updates.dateRange ?? base.dateRange
      const nextPage = updates.page ?? 1

      if (nextSearch.trim()) {
        params.set('lessonQ', nextSearch)
      } else {
        params.delete('lessonQ')
      }

      if (nextSortDir === 'asc') {
        params.set('lessonSort', 'asc')
      } else {
        params.delete('lessonSort')
      }

      if (nextSubject) {
        params.set('lessonSubject', nextSubject)
      } else {
        params.delete('lessonSubject')
      }

      if (nextStatus) {
        params.set('lessonStatus', nextStatus)
      } else {
        params.delete('lessonStatus')
      }

      if (nextRange?.from) {
        params.set('lessonFrom', startOfDayIso(nextRange.from))
      } else {
        params.delete('lessonFrom')
      }

      if (nextRange?.to) {
        params.set('lessonTo', endOfDayIso(nextRange.to))
      } else {
        params.delete('lessonTo')
      }

      if (nextPage > 1) {
        params.set('lessonPage', String(nextPage))
      } else {
        params.delete('lessonPage')
      }

      const nextParams = params.toString()
      const url = nextParams ? `${pathname}?${nextParams}` : pathname
      router.replace(url, { scroll: false })
    },
    [filters, pathname, router, searchParamsString]
  )

  const handleApplyFilters = React.useCallback(() => {
    updateParams({ page: 1 }, filters)
  }, [filters, updateParams])

  const handleClearFilters = React.useCallback(() => {
    setFilters(defaultFilters)
    updateParams(
      {
        search: '',
        subjectId: '',
        status: '',
        sortDir: currentFilters.sortDir,
        dateRange: undefined,
        page: 1
      },
      defaultFilters
    )
  }, [currentFilters.sortDir, updateParams])



  const firstLoad = useFirstLoad(isLoading)
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <PageHeader title='Le mie lezioni' backHref='/tutor' actions={viewSwitch} />
          <div className='mt-4 empty:hidden'>
            <PushInviteCard
              userId={profile?.id}
              role={profile?.role}
              title='Ricevi un avviso se una lezione cambia'
              description='Ti avvisiamo quando uno studente prenota o annulla, e quando una tua lezione viene spostata.'
            />
          </div>

          <FilterForm
            className='mt-4'
            values={filters}
            applied={currentFilters}
            onSubmit={(event) => {
              event.preventDefault()
              handleApplyFilters()
            }}
            search={{
              id: 'lesson-search',
              value: filters.search,
              onChange: (value) => setFilters((prev) => ({ ...prev, search: value })),
              placeholder: 'Data, studente, classe, email o materia'
            }}
            activeFilters={[filters.subjectId, filters.status, filters.dateRange?.from].filter(Boolean).length}
            onReset={handleClearFilters}
          >
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
              <Field className='gap-2'>
                <FieldLabel>Materia</FieldLabel>
                <Select
                  value={filters.subjectId || 'all'}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      subjectId: value === 'all' ? '' : value
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue
                      placeholder={
                        subjectsLoading ? 'Caricamento...' : 'Tutte le materie'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>Tutte le materie</SelectItem>
                    {sortedSubjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className='gap-2'>
                <FieldLabel>Stato</FieldLabel>
                <Select
                  value={filters.status || 'all'}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      status: value === 'all' ? '' : value
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='Tutti gli stati' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>Tutti gli stati</SelectItem>
                    <SelectItem value='confirmed'>Confermata</SelectItem>
                    <SelectItem value='scheduled'>Programmata</SelectItem>
                    <SelectItem value='canceled'>Annullata</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field className='gap-2'>
                <FieldLabel htmlFor='lesson-date-range'>Periodo</FieldLabel>
                <DateRangePicker id='lesson-date-range' value={filters.dateRange} onChange={(range) => setFilters((prev) => ({ ...prev, dateRange: range }))} />
              </Field>
            </div>
          </FilterForm>

          <div className='mt-6 rounded-lg border'>
            <Table>
              <TableHeader sticky className='bg-muted/50'>
                <TableRow>
                  <TableHead>
                    <SortableHead
                      label='Data e ora'
                      sortKey='startAt'
                      sortBy='startAt'
                      sortDir={currentFilters.sortDir}
                      onSort={() => {
                        const next = { ...filters, sortDir: currentFilters.sortDir === 'asc' ? 'desc' as const : 'asc' as const }
                        setFilters(next)
                        updateParams({ sortDir: next.sortDir, page: 1 }, next)
                      }}
                    />
                  </TableHead>
                  <TableHead>Materia</TableHead>
                  <TableHead className='whitespace-nowrap'>Posti occupati</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={cn(isLoading && 'opacity-60 transition-opacity')} aria-busy={isLoading}>
                {firstLoad ? (
                  <TableSkeletonRows columns={4} />
                ) : lessons.length ? (
                  lessons.map((lesson) => {
                    const subject = lessonSubject(lesson.subjectId, subjectMap)
                    return (
                      <TableRow
                        key={lesson.id}
                        className='cursor-pointer'
                        tabIndex={0}
                        onClick={() => router.push(withFrom(`/tutor/lessons/${lesson.id}`, here))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') router.push(withFrom(`/tutor/lessons/${lesson.id}`, here))
                        }}
                      >
                        <TableCell>
                          {formatItalianDate(lesson.startAt)}
                        </TableCell>
                        <TableCell>
                          {subjectsLoading
                            ? 'Caricamento...'
                            : (subject?.name ?? '-')}
                        </TableCell>
                        <TableCell>{lessonSeatsLabel(lesson)}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(lesson.status)}>
                            {formatStatusLabel(lesson.status)}
                          </Badge>
                          {isLessonNonBookable(lesson) ? (
                            <div className='mt-2'>
                              <Badge variant='outline'>Non prenotabile</Badge>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className='text-muted-foreground'>
                      Nessuna lezione trovata.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <ListPagination page={currentFilters.page} pageSize={pageSize} total={total} onPageChange={(next) => updateParams({ page: next }, appliedFilters)} loading={isLoading} className='mt-4' />
        </div>
      </div>

    </main>
  )
}
