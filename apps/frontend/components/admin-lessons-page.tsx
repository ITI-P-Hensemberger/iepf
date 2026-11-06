'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarIcon } from 'lucide-react'

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
import { Calendar } from '@/components/ui/calendar'
import { Field, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { BackButton } from '@/components/back-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
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

import { format } from 'date-fns'
import { toast } from 'sonner'

import { formatItalianDate } from '@/lib/format-date'
import { lessonSubject } from '@/lib/lesson-subject'
import { type DateRange } from 'react-day-picker'

import { extractPayloadArray } from '@/lib/backend-response'

const pageSize = 20
const AVAILABLE_TIMES = ['13:00', '14:00', '15:00', '16:00']

type Lesson = {
  id: string
  tutorId: string
  subjectId: string | null
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyAvailability?: number | null
  dailyOccupancy?: number | null
  availableSeats: number
  countsForTutor?: boolean | null
  status: string
}

type Tutor = {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  year?: number | null
  sectionName?: string | null
}

type Subject = {
  id: string
  name: string
}

type LessonFilters = {
  tutorId: string
  subjectId: string
  status: string
  sortBy: string
  sortDir: 'asc' | 'desc'
  dateRange?: DateRange
}

const defaultFilters: LessonFilters = {
  tutorId: '',
  subjectId: '',
  status: '',
  sortBy: 'startAt',
  sortDir: 'desc',
  dateRange: undefined
}

function parseSortParam(value: string | null) {
  if (!value) {
    return null
  }
  const [sortBy, direction] = value.split(':')
  if (!sortBy) {
    return null
  }
  const sortDir: 'asc' | 'desc' = direction === 'desc' ? 'desc' : 'asc'
  return { sortBy, sortDir }
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

function combineDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const combined = new Date(date)
  combined.setHours(hours || 0, minutes || 0, 0, 0)
  return combined
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

function lessonOccupiedSeats(lesson?: Lesson | null) {
  if (!lesson || typeof lesson.availableSeats !== 'number') {
    return 0
  }
  return Math.max(0, lesson.lessonCapacity - lesson.availableSeats)
}

function tutorLabel(tutor?: Tutor) {
  if (!tutor) {
    return null
  }
  const label = `${tutor.lastName} ${tutor.firstName}`.trim()
  return label || tutor.id
}

function tutorTableLabel(tutor?: Tutor) {
  return tutorLabel(tutor)
}

function buildTutorOptionLabel(tutor: Tutor): string {
  return tutorLabel(tutor) ?? tutor.id
}

export default function AdminLessonsPage({ viewSwitch }: { viewSwitch?: React.ReactNode } = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()

  const [filters, setFilters] = React.useState<LessonFilters>(defaultFilters)
  const [lessons, setLessons] = React.useState<Lesson[]>([])
  const [total, setTotal] = React.useState(0)
  const [isLoading, setIsLoading] = React.useState(true)
  const [subjects, setSubjects] = React.useState<Subject[]>([])
  const [subjectsLoading, setSubjectsLoading] = React.useState(true)

  const [tutors, setTutors] = React.useState<Tutor[]>([])
  const [tutorsLoading, setTutorsLoading] = React.useState(true)
  const [isFilterDateDialogOpen, setIsFilterDateDialogOpen] =
    React.useState(false)
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [isCreateDateOpen, setIsCreateDateOpen] = React.useState(false)
  const [createForm, setCreateForm] = React.useState({
    tutorId: '',
    subjectId: '',
    date: undefined as Date | undefined,
    time: '15:00'
  })
  const [isCreating, setIsCreating] = React.useState(false)
  const [createTutorSubjectIds, setCreateTutorSubjectIds] =
    React.useState<Set<string>>(new Set())
  const [createTutorSubjectsLoading, setCreateTutorSubjectsLoading] =
    React.useState(false)

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
    const sortParam = parseSortParam(searchParams.get('lessonSort'))
    const fromParam = parseDateParam(searchParams.get('lessonFrom'))
    const toParam = parseDateParam(searchParams.get('lessonTo'))
    return {
      tutorId: searchParams.get('lessonTutor') ?? '',
      subjectId: searchParams.get('lessonSubject') ?? '',
      status: searchParams.get('lessonStatus') ?? '',
      dateRange:
        fromParam || toParam
          ? {
              from: fromParam,
              to: toParam
            }
          : undefined,
      sortBy: sortParam?.sortBy ?? defaultFilters.sortBy,
      sortDir: sortParam?.sortDir ?? defaultFilters.sortDir,
      page: parsePage('lessonPage')
    }
  }, [parsePage, searchParams])

  React.useEffect(() => {
    setFilters({
      tutorId: currentFilters.tutorId,
      subjectId: currentFilters.subjectId,
      status: currentFilters.status,
      sortBy: currentFilters.sortBy,
      sortDir: currentFilters.sortDir,
      dateRange: currentFilters.dateRange
    })
  }, [currentFilters])

  const subjectMap = React.useMemo(() => {
    const map = new Map<string, Subject>()
    subjects.forEach((subject) => map.set(subject.id, subject))
    return map
  }, [subjects])

  const tutorMap = React.useMemo(() => {
    const map = new Map<string, Tutor>()
    tutors.forEach((tutor) => map.set(tutor.id, tutor))
    return map
  }, [tutors])

  const sortedTutors = React.useMemo(() => {
    return [...tutors].sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName)
      if (lastNameCompare !== 0) {
        return lastNameCompare
      }
      return a.firstName.localeCompare(b.firstName)
    })
  }, [tutors])

  const sortedSubjects = React.useMemo(() => {
    return [...subjects].sort((a, b) => a.name.localeCompare(b.name))
  }, [subjects])

  const createSubjectSplit = React.useMemo(() => {
    if (!createTutorSubjectIds.size) {
      return { preferred: [] as Subject[], others: sortedSubjects }
    }
    const preferred: Subject[] = []
    const others: Subject[] = []
    sortedSubjects.forEach((subject) => {
      if (createTutorSubjectIds.has(subject.id)) {
        preferred.push(subject)
      } else {
        others.push(subject)
      }
    })
    return { preferred, others }
  }, [createTutorSubjectIds, sortedSubjects])

  const loadLessons = React.useCallback(async () => {
    setIsLoading(true)
    const params = new URLSearchParams()
    if (currentFilters.tutorId) {
      params.set('tutorId', currentFilters.tutorId)
    }
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
    params.set('sortBy', currentFilters.sortBy)
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
  }, [currentFilters])

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

    async function loadTutors() {
      setTutorsLoading(true)

      try {
        const params = new URLSearchParams({
          role: 'tutor',
          limit: '200',
          offset: '0'
        })
        const response = await fetch(`/api/users?${params.toString()}`)
        if (!response.ok) {
          throw new Error('Impossibile caricare i tutor.')
        }
        const payload = await response.json()
        const data = payload && typeof payload === 'object' ? payload : null
        const items = Array.isArray(data?.data)
          ? (data?.data as Tutor[])
          : Array.isArray(data?.items)
            ? (data?.items as Tutor[])
            : Array.isArray(data?.results)
              ? (data?.results as Tutor[])
              : Array.isArray(data?.rows)
                ? (data?.rows as Tutor[])
                : []
        if (isMounted) {
          setTutors(items)
        }
      } catch (err) {
        if (isMounted) {
          toast.error(
            err instanceof Error ? err.message : 'Impossibile caricare i tutor.'
          )
        }
      } finally {
        if (isMounted) {
          setTutorsLoading(false)
        }
      }
    }

    void loadSubjects()
    void loadTutors()

    return () => {
      isMounted = false
    }
  }, [])

  React.useEffect(() => {
    void loadLessons()
  }, [loadLessons])

  React.useEffect(() => {
    if (!isCreateOpen || !createForm.tutorId) {
      setCreateTutorSubjectIds(new Set())
      return
    }

    let isMounted = true

    async function loadTutorSubjects() {
      setCreateTutorSubjectsLoading(true)
      try {
        const response = await fetch(
          `/api/tutors/${createForm.tutorId}/subjects`
        )
        if (!response.ok) {
          throw new Error('Impossibile caricare le materie.')
        }
        const payload = await response.json()
        const items = extractPayloadArray<Subject>(payload)
        const resolvedItems =
          items.length === 0 &&
          payload &&
          typeof payload === 'object' &&
          'data' in payload
            ? extractPayloadArray<Subject>(
                (payload as { data?: unknown }).data
              )
            : items
        if (isMounted) {
          const ids = resolvedItems
            .map((item) => {
              const candidate = item as Subject & {
                subjectId?: string
                subject?: { id?: string } | null
              }
              return (
                candidate.id ||
                candidate.subjectId ||
                candidate.subject?.id ||
                ''
              )
            })
            .filter((value) => value)
          setCreateTutorSubjectIds(new Set(ids))
        }
      } catch {
        if (isMounted) {
          setCreateTutorSubjectIds(new Set())
        }
      } finally {
        if (isMounted) {
          setCreateTutorSubjectsLoading(false)
        }
      }
    }

    void loadTutorSubjects()

    return () => {
      isMounted = false
    }
  }, [createForm.tutorId, isCreateOpen])

  const appliedFilters = React.useMemo(
    () => ({
      tutorId: currentFilters.tutorId,
      subjectId: currentFilters.subjectId,
      status: currentFilters.status,
      sortBy: currentFilters.sortBy,
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
      const nextTutor = updates.tutorId ?? base.tutorId
      const nextSubject = updates.subjectId ?? base.subjectId
      const nextStatus = updates.status ?? base.status
      const nextRange = updates.dateRange ?? base.dateRange
      const nextSortBy = updates.sortBy ?? base.sortBy
      const nextSortDir = updates.sortDir ?? base.sortDir
      const nextPage = updates.page ?? 1

      if (nextTutor) {
        params.set('lessonTutor', nextTutor)
      } else {
        params.delete('lessonTutor')
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

      if (nextSortBy) {
        params.set('lessonSort', `${nextSortBy}:${nextSortDir}`)
      } else {
        params.delete('lessonSort')
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
        tutorId: '',
        subjectId: '',
        status: '',
        sortBy: defaultFilters.sortBy,
        sortDir: defaultFilters.sortDir,
        dateRange: undefined,
        page: 1
      },
      defaultFilters
    )
  }, [updateParams])

  const handleOpenCreate = React.useCallback(() => {
    setCreateForm({
      tutorId: '',
      subjectId: '',
      date: undefined,
      time: '15:00'
    })
    setIsCreateOpen(true)
  }, [])

  const handleCreate = React.useCallback(async () => {
    if (!createForm.tutorId.trim()) {
      toast.error('Seleziona un tutor valido.')
      return
    }
    if (!createForm.subjectId.trim()) {
      toast.error('Seleziona una materia valida.')
      return
    }
    if (!createForm.date) {
      toast.error('Inserisci una data valida.')
      return
    }
    const timeValue = AVAILABLE_TIMES.includes(createForm.time)
      ? createForm.time
      : '15:00'
    const startAtIso = combineDateAndTime(
      createForm.date,
      timeValue
    ).toISOString()

    setIsCreating(true)

    try {
      const response = await fetch('/api/lessons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tutorId: createForm.tutorId,
          subjectId: createForm.subjectId,
          startAt: startAtIso,
          durationMinutes: 60
        })
      })
      if (!response.ok) {
        let message = 'Impossibile creare la lezione.'
        try {
          const payload = await response.json()
          if (payload && typeof payload === 'object' && 'message' in payload) {
            message = String(payload.message || message)
          }
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      let createdLessonId: string | null = null
      try {
        const payload = await response.json()
        if (payload && typeof payload === 'object') {
          const candidate =
            'lessonId' in payload
              ? (payload.lessonId as string | undefined)
              : 'id' in payload
                ? (payload.id as string | undefined)
                : null
          createdLessonId = candidate && candidate.trim() ? candidate : null
        }
      } catch {
        // ignore
      }
      toast.success('Lezione creata.')
      setIsCreateOpen(false)
      if (createdLessonId) {
        router.push(`/admin/lessons/${createdLessonId}`)
        return
      }
      await loadLessons()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile creare la lezione.'
      )
    } finally {
      setIsCreating(false)
    }
  }, [createForm, loadLessons, router])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <div className='mb-6 self-start'>
            <BackButton href='/admin' />
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Gestione lezioni</h1>
            <div className='flex flex-wrap items-center gap-2'>
              {viewSwitch}
              <Button onClick={handleOpenCreate}>Crea lezione</Button>
            </div>
          </div>

          <form
            className='mt-6 rounded-lg border bg-card p-4 shadow-sm'
            onSubmit={(event) => {
              event.preventDefault()
              handleApplyFilters()
            }}
          >
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
              <Field className='gap-2'>
                <FieldLabel>Tutor</FieldLabel>
                <Select
                  value={filters.tutorId || 'all'}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      tutorId: value === 'all' ? '' : value
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue
                      placeholder={
                        tutorsLoading ? 'Caricamento...' : 'Tutti i tutor'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>Tutti i tutor</SelectItem>
                    {sortedTutors.map((tutor) => (
                      <SelectItem key={tutor.id} value={tutor.id}>
                        {buildTutorOptionLabel(tutor)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
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
                <Button
                  variant='outline'
                  id='lesson-date-range'
                  className='justify-start px-2.5 font-normal'
                  onClick={() => setIsFilterDateDialogOpen(true)}
                >
                  <CalendarIcon className='mr-2 h-4 w-4' />
                  {filters.dateRange?.from ? (
                    filters.dateRange.to ? (
                      <>
                        {format(filters.dateRange.from, 'dd/MM/yyyy')} -{' '}
                        {format(filters.dateRange.to, 'dd/MM/yyyy')}
                      </>
                    ) : (
                      format(filters.dateRange.from, 'dd/MM/yyyy')
                    )
                  ) : (
                    <span>Seleziona periodo</span>
                  )}
                </Button>
              </Field>
            </div>
            <div className='mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
                <Field className='gap-2'>
                  <FieldLabel>Ordina per</FieldLabel>
                  <Select
                    value={filters.sortBy}
                    onValueChange={(value) =>
                      setFilters((prev) => ({
                        ...prev,
                        sortBy: value
                      }))
                    }
                  >
                    <SelectTrigger className='w-full sm:w-[180px]'>
                      <SelectValue placeholder='Ordinamento' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='startAt'>Data lezione</SelectItem>
                      <SelectItem value='createdAt'>Creazione</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className='gap-2'>
                  <FieldLabel>Direzione</FieldLabel>
                  <Select
                    value={filters.sortDir}
                    onValueChange={(value) =>
                      setFilters((prev) => ({
                        ...prev,
                        sortDir: value === 'desc' ? 'desc' : 'asc'
                      }))
                    }
                  >
                    <SelectTrigger className='w-full sm:w-[150px]'>
                      <SelectValue placeholder='Direzione' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='asc'>Crescente</SelectItem>
                      <SelectItem value='desc'>Decrescente</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className='flex flex-col gap-2 pt-2 sm:pt-0 sm:flex-row sm:items-end'>
                <Button variant='outline' type='button' onClick={handleClearFilters}>
                  Reset filtri
                </Button>
                <Button type='submit'>Applica filtri</Button>
              </div>
            </div>
          </form>

          <div className='mt-6 rounded-lg border'>
            <Table>
              <TableHeader className='bg-muted/50'>
                <TableRow>
                  <TableHead className='whitespace-nowrap'>Data e ora</TableHead>
                  <TableHead>Tutor</TableHead>
                  <TableHead>Materia</TableHead>
                  <TableHead className='whitespace-nowrap'>
                    Posti occupati
                  </TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className='text-muted-foreground'>
                      Caricamento...
                    </TableCell>
                  </TableRow>
                ) : lessons.length ? (
                  lessons.map((lesson) => {
                    const subject = lessonSubject(lesson.subjectId, subjectMap)
                    const tutor = tutorMap.get(lesson.tutorId)
                    return (
                      <TableRow
                        key={lesson.id}
                        className='cursor-pointer'
                        tabIndex={0}
                        onClick={() => router.push(`/admin/lessons/${lesson.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') router.push(`/admin/lessons/${lesson.id}`)
                        }}
                      >
                        <TableCell>
                          {formatItalianDate(lesson.startAt)}
                        </TableCell>
                        <TableCell>
                          {tutorsLoading
                            ? 'Caricamento...'
                            : (tutorTableLabel(tutor) ?? '-')}
                        </TableCell>
                        <TableCell>
                          {subjectsLoading
                            ? 'Caricamento...'
                            : (subject?.name ?? '-')}
                        </TableCell>
                        <TableCell>
                          {lessonOccupiedSeats(lesson)}/{lesson.lessonCapacity}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(lesson.status)}>
                            {formatStatusLabel(lesson.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className='text-muted-foreground'>
                      Nessuna lezione trovata.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className='mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
            <span>
              Pagina {currentFilters.page} di {totalPages} · Totale {total}
            </span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  updateParams(
                    { page: currentFilters.page - 1 },
                    appliedFilters
                  )
                }
                disabled={currentFilters.page <= 1 || isLoading}
              >
                Precedente
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  updateParams(
                    { page: currentFilters.page + 1 },
                    appliedFilters
                  )
                }
                disabled={currentFilters.page >= totalPages || isLoading}
              >
                Successiva
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        open={isFilterDateDialogOpen}
        onOpenChange={setIsFilterDateDialogOpen}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Seleziona periodo</AlertDialogTitle>
            <AlertDialogDescription>
              Scegli l&apos;intervallo di date per filtrare le lezioni.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='flex justify-center'>
              <Calendar
                mode='range'
                defaultMonth={filters.dateRange?.from ?? new Date()}
                selected={filters.dateRange}
                onSelect={(range) =>
                  setFilters((prev) => ({
                    ...prev,
                    dateRange: range
                  }))
                }
                numberOfMonths={1}
              />
            </div>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                setIsFilterDateDialogOpen(false)
              }}
            >
              Applica
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-xl'>
          <AlertDialogHeader>
            <AlertDialogTitle>Crea lezione</AlertDialogTitle>
            <AlertDialogDescription>
              Inserisci i dettagli della nuova lezione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field className='gap-2'>
                <Label htmlFor='create-tutor'>Tutor</Label>
                <Select
                  value={createForm.tutorId || '__none__'}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      tutorId: value === '__none__' ? '' : value
                    }))
                  }
                >
                  <SelectTrigger id='create-tutor' className='w-full'>
                    <SelectValue
                      placeholder={
                        tutorsLoading ? 'Caricamento...' : 'Seleziona tutor'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__none__'>Seleziona tutor</SelectItem>
                    {sortedTutors.map((tutor) => (
                      <SelectItem key={tutor.id} value={tutor.id}>
                        {buildTutorOptionLabel(tutor)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className='gap-2'>
                <Label htmlFor='create-subject'>Materia</Label>
                <Select
                  value={createForm.subjectId || '__none__'}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      subjectId: value === '__none__' ? '' : value
                    }))
                  }
                >
                  <SelectTrigger id='create-subject' className='w-full'>
                    <SelectValue
                      placeholder={
                        createTutorSubjectsLoading || subjectsLoading
                          ? 'Caricamento...'
                          : 'Seleziona materia'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__none__'>Seleziona materia</SelectItem>
                    {createSubjectSplit.preferred.length > 0 ? (
                      <SelectItem value='__preferred__' disabled>
                        Materie del tutor
                      </SelectItem>
                    ) : null}
                    {createSubjectSplit.preferred.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                    {createSubjectSplit.preferred.length > 0 &&
                    createSubjectSplit.others.length > 0 ? (
                      <SelectSeparator />
                    ) : null}
                    {createSubjectSplit.preferred.length > 0 &&
                    createSubjectSplit.others.length > 0 ? (
                      <SelectItem value='__others__' disabled>
                        Altre materie
                      </SelectItem>
                    ) : null}
                    {createSubjectSplit.others.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className='gap-2'>
                <Label htmlFor='create-date-time'>Data e ora</Label>
                <Button
                  variant='outline'
                  id='create-date-time'
                  className='w-full justify-start px-2.5 font-normal'
                  onClick={() => setIsCreateDateOpen(true)}
                >
                  <CalendarIcon className='mr-2 h-4 w-4' />
                  {createForm.date ? (
                    <>
                      {format(createForm.date, 'dd/MM/yyyy')} {createForm.time}
                    </>
                  ) : (
                    <span>Seleziona data</span>
                  )}
                </Button>
              </Field>
            </div>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleCreate()
              }}
              disabled={isCreating}
            >
              {isCreating ? 'Salvataggio...' : 'Crea lezione'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isCreateDateOpen}
        onOpenChange={setIsCreateDateOpen}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Seleziona data e ora</AlertDialogTitle>
            <AlertDialogDescription>
              Scegli data e orario per la nuova lezione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='flex justify-center'>
              <Calendar
                mode='single'
                selected={createForm.date}
                onSelect={(date) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    date: date ?? undefined
                  }))
                }
                defaultMonth={createForm.date ?? new Date()}
                initialFocus
              />
            </div>
            <Field className='gap-2'>
              <Label htmlFor='create-time-dialog'>Orario</Label>
              <Select
                value={createForm.time}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({ ...prev, time: value }))
                }
              >
                <SelectTrigger id='create-time-dialog' className='w-full'>
                  <SelectValue placeholder='Seleziona orario' />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_TIMES.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                setIsCreateDateOpen(false)
              }}
            >
              Applica
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
