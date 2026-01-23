'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarIcon, ExternalLink, MessageSquare } from 'lucide-react'

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
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
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

import { format } from 'date-fns'
import { toast } from 'sonner'

import { formatItalianDate } from '@/lib/format-date'
import { type DateRange } from 'react-day-picker'

import { extractPayloadArray } from '@/lib/backend-response'

const pageSize = 15
const AVAILABLE_TIMES = ['13:00', '14:00', '15:00', '16:00']

type Lesson = {
  id: string
  tutorId: string
  subjectId: string
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyCapacity: number
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
  if (capacity === null) {
    return 0
  }
  if (available === null) {
    return 0
  }
  return Math.max(0, capacity - available)
}

function lessonSeatsLabel(lesson: Lesson) {
  const capacity = parseNumeric(lesson.lessonCapacity)
  if (capacity === null) {
    return '-'
  }
  return `${lessonOccupiedSeats(lesson)}/${capacity}`
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

function extractErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.message === 'string') {
      return record.message
    }
    if (record.error && typeof record.error === 'object') {
      const error = record.error as Record<string, unknown>
      if (typeof error.message === 'string') {
        return error.message
      }
    }
  }
  return fallback
}

export default function AdminLessonsPage() {
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
  const [isRescheduleDateDialogOpen, setIsRescheduleDateDialogOpen] =
    React.useState(false)

  const [cancelTarget, setCancelTarget] = React.useState<Lesson | null>(null)
  const [isCancelling, setIsCancelling] = React.useState(false)
  const [cancelCountsForTutor, setCancelCountsForTutor] = React.useState(false)

  const [rescheduleTarget, setRescheduleTarget] = React.useState<Lesson | null>(
    null
  )
  const [isRescheduling, setIsRescheduling] = React.useState(false)
  const [rescheduleForm, setRescheduleForm] = React.useState({
    lessonId: '',
    tutorId: '',
    subjectId: '',
    date: undefined as Date | undefined,
    time: '15:00'
  })

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

  const handleCancelLesson = React.useCallback(async () => {
    if (!cancelTarget) {
      return
    }

    setIsCancelling(true)

    try {
      const response = await fetch(`/api/lessons/${cancelTarget.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ countsForTutor: cancelCountsForTutor })
      })
      if (!response.ok) {
        let message = 'Impossibile annullare la lezione.'
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      toast.success('Lezione annullata.')
      setCancelTarget(null)
      await loadLessons()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile annullare la lezione.'
      )
    } finally {
      setIsCancelling(false)
    }
  }, [cancelCountsForTutor, cancelTarget, loadLessons])

  const handleRescheduleLesson = React.useCallback(async () => {
    if (!rescheduleTarget) {
      return
    }

    const timeValue = AVAILABLE_TIMES.includes(rescheduleForm.time)
      ? rescheduleForm.time
      : '15:00'
    const dateValue = rescheduleForm.date
    const startAtIso = dateValue
      ? combineDateAndTime(dateValue, timeValue).toISOString()
      : ''

    if (!rescheduleForm.tutorId.trim()) {
      toast.error('Inserisci un tutor valido.')
      return
    }
    if (!rescheduleForm.subjectId.trim()) {
      toast.error('Inserisci una materia valida.')
      return
    }
    if (!dateValue) {
      toast.error('Inserisci una data valida.')
      return
    }
    setIsRescheduling(true)

    try {
      const payload = {
        tutorId: rescheduleForm.tutorId.trim(),
        subjectId: rescheduleForm.subjectId.trim(),
        startAt: startAtIso,
        durationMinutes: 60
      }

      const response = await fetch(
        `/api/lessons/${rescheduleTarget.id}/reschedule`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      )

      if (!response.ok) {
        let message = 'Impossibile riprogrammare la lezione.'
        try {
          const responsePayload = await response.json()
          message = extractErrorMessage(responsePayload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }

      toast.success('Lezione riprogrammata.')
      setRescheduleTarget(null)
      await loadLessons()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile riprogrammare la lezione.'
      )
    } finally {
      setIsRescheduling(false)
    }
  }, [loadLessons, rescheduleForm, rescheduleTarget])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Gestione lezioni</h1>
            <Button asChild variant='outline'>
              <Link href='/admin'>Torna al pannello</Link>
            </Button>
          </div>

          <div className='mt-6 rounded-lg border bg-card p-4 shadow-sm'>
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
                <Button variant='outline' onClick={handleClearFilters}>
                  Reset filtri
                </Button>
                <Button onClick={handleApplyFilters}>Applica filtri</Button>
              </div>
            </div>
          </div>

          <div className='mt-6 rounded-lg border'>
            <Table>
              <TableHeader className='bg-muted/50'>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tutor</TableHead>
                  <TableHead>Materia</TableHead>
                  <TableHead>Posti</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className='w-16'>
                    <span className='sr-only'>Azioni</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className='text-muted-foreground'>
                      Caricamento...
                    </TableCell>
                  </TableRow>
                ) : lessons.length ? (
                  lessons.map((lesson) => {
                    const subject = subjectMap.get(lesson.subjectId)
                    const tutor = tutorMap.get(lesson.tutorId)
                    return (
                      <TableRow key={lesson.id}>
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
                        <TableCell>{lessonSeatsLabel(lesson)}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(lesson.status)}>
                            {formatStatusLabel(lesson.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className='w-16 text-right'>
                          <div className='flex items-center justify-end gap-1'>
                            <Button
                              asChild
                              variant='ghost'
                              size='icon'
                              aria-label='Apri dettagli lezione'
                              className='h-6 w-6 p-0'
                            >
                              <Link href={`/admin/lessons/${lesson.id}`}>
                                <ExternalLink className='h-4 w-4' />
                              </Link>
                            </Button>
                            <Button
                              asChild
                              variant='ghost'
                              size='icon'
                              aria-label='Gestione feedback lezione'
                              className='h-6 w-6 p-0'
                            >
                              <Link
                                href={`/admin/feedback?feedbackLesson=${lesson.id}`}
                              >
                                <MessageSquare className='h-4 w-4' />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className='text-muted-foreground'>
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
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Annulla lezione</AlertDialogTitle>
            <AlertDialogDescription>
              Confermi l&apos;annullamento della lezione selezionata?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelTarget && (
            <div className='rounded-md border p-3 text-sm text-muted-foreground space-y-1'>
              <div>Data: {formatItalianDate(cancelTarget.startAt)}</div>
              <div>
                Tutor:{' '}
                {tutorsLoading
                  ? 'Caricamento...'
                  : (tutorTableLabel(tutorMap.get(cancelTarget.tutorId)) ??
                    '-')}
              </div>
              <div>
                Materia:{' '}
                {subjectsLoading
                  ? 'Caricamento...'
                  : (subjectMap.get(cancelTarget.subjectId)?.name ?? '-')}
              </div>
              <div>
                Posti occupati: {lessonOccupiedSeats(cancelTarget)}/
                {parseNumeric(cancelTarget.lessonCapacity) ?? '-'}
              </div>
            </div>
          )}
          <div className='flex items-center gap-3'>
            <Checkbox
              id='cancel-counts-tutor'
              checked={cancelCountsForTutor}
              onCheckedChange={(value) =>
                setCancelCountsForTutor(Boolean(value))
              }
            />
            <Label htmlFor='cancel-counts-tutor'>Conteggia per il tutor</Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleCancelLesson()
              }}
              disabled={isCancelling}
            >
              {isCancelling ? 'Annullamento...' : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(rescheduleTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRescheduleTarget(null)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-xl'>
          <AlertDialogHeader>
            <AlertDialogTitle>Riprogramma lezione</AlertDialogTitle>
            <AlertDialogDescription>
              Modifica i dettagli della lezione selezionata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field className='gap-2'>
                <Label htmlFor='reschedule-tutor'>Tutor</Label>
                <Select
                  value={rescheduleForm.tutorId || '__none__'}
                  onValueChange={(value) =>
                    setRescheduleForm((prev) => ({
                      ...prev,
                      tutorId: value === '__none__' ? '' : value
                    }))
                  }
                >
                  <SelectTrigger id='reschedule-tutor' className='w-full'>
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
                <Label htmlFor='reschedule-subject'>Materia</Label>
                <Select
                  value={rescheduleForm.subjectId || '__none__'}
                  onValueChange={(value) =>
                    setRescheduleForm((prev) => ({
                      ...prev,
                      subjectId: value === '__none__' ? '' : value
                    }))
                  }
                >
                  <SelectTrigger id='reschedule-subject' className='w-full'>
                    <SelectValue
                      placeholder={
                        subjectsLoading ? 'Caricamento...' : 'Seleziona materia'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__none__'>Seleziona materia</SelectItem>
                    {sortedSubjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className='gap-2'>
                <Label htmlFor='reschedule-date-time'>Data e ora</Label>
                <Button
                  variant='outline'
                  id='reschedule-date-time'
                  className='w-full justify-start px-2.5 font-normal'
                  onClick={() => setIsRescheduleDateDialogOpen(true)}
                >
                  <CalendarIcon className='mr-2 h-4 w-4' />
                  {rescheduleForm.date ? (
                    <>
                      {format(rescheduleForm.date, 'dd/MM/yyyy')}{' '}
                      {rescheduleForm.time}
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
                void handleRescheduleLesson()
              }}
              disabled={isRescheduling}
            >
              {isRescheduling ? 'Salvataggio...' : 'Salva modifiche'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isRescheduleDateDialogOpen}
        onOpenChange={setIsRescheduleDateDialogOpen}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Seleziona data e ora</AlertDialogTitle>
            <AlertDialogDescription>
              Scegli la nuova data e l&apos;orario della lezione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='flex justify-center'>
              <Calendar
                mode='single'
                selected={rescheduleForm.date}
                onSelect={(date) =>
                  setRescheduleForm((prev) => ({
                    ...prev,
                    date: date ?? undefined
                  }))
                }
                defaultMonth={rescheduleForm.date ?? new Date()}
                initialFocus
              />
            </div>
            <Field className='gap-2'>
              <Label htmlFor='reschedule-time-dialog'>Orario</Label>
              <Select
                value={rescheduleForm.time}
                onValueChange={(value) =>
                  setRescheduleForm((prev) => ({
                    ...prev,
                    time: value
                  }))
                }
              >
                <SelectTrigger id='reschedule-time-dialog' className='w-full'>
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
                setIsRescheduleDateDialogOpen(false)
              }}
            >
              Applica
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </main>
  )
}
