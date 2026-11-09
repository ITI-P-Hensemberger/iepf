'use client'

import { DatePicker, DateRangePicker, useSchoolDays } from '@/components/date-picker'
import { cn } from '@/lib/utils'

import { nextSort, SortableHead } from '@/components/sortable-head'
import { ListPagination } from '@/components/list-pagination'
import { TableSkeletonRows, useFirstLoad } from '@/components/loading'
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

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
import { Field, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { FilterForm } from '@/components/filter-form'
import { PageHeader } from '@/components/page-header'
import { useHere, withFrom } from '@/lib/back-link'
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

import { toast } from 'sonner'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, jsonBody } from '@/lib/api-fetch'

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
  search: string
  tutorId: string
  subjectId: string
  status: string
  sortBy: string
  sortDir: 'asc' | 'desc'
  dateRange?: DateRange
}

const defaultFilters: LessonFilters = {
  search: '',
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

const TUTORS_QUERY = 'role=tutor&limit=200&offset=0'
// Stable while nothing has loaded, so the memos built on them do not rerun on every render.
const noLessons: Lesson[] = []
const noSubjects: Subject[] = []
const noTutors: Tutor[] = []
const noSubjectIds: string[] = []

export default function AdminLessonsPage({ viewSwitch }: { viewSwitch?: React.ReactNode } = {}) {
  const router = useRouter()
  const here = useHere()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()

  const [filters, setFilters] = React.useState<LessonFilters>(defaultFilters)
  const queryClient = useQueryClient()
  const { data: subjects = noSubjects, isPending: subjectsLoading } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => extractPayloadArray<Subject>(await apiFetch('/api/subjects', 'Impossibile caricare le materie.'))
  })
  const { data: tutors = noTutors, isPending: tutorsLoading } = useQuery({
    queryKey: ['users', TUTORS_QUERY],
    queryFn: async () => extractPayloadArray<Tutor>(await apiFetch(`/api/users?${TUTORS_QUERY}`, 'Impossibile caricare i tutor.'))
  })
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const schoolDays = useSchoolDays()
  const [createForm, setCreateForm] = React.useState({
    tutorId: '',
    subjectId: '',
    date: undefined as Date | undefined,
    time: '15:00'
  })
  // The tutor's subjects come first in the create dialog; without them every subject is listed.
  const tutorSubjectsResult = useQuery({
    queryKey: ['users', createForm.tutorId, 'subjects'],
    queryFn: async () => extractPayloadArray<Subject>(await apiFetch(`/api/tutors/${createForm.tutorId}/subjects`, 'Impossibile caricare le materie.'))
      .map((subject) => subject.id),
    enabled: isCreateOpen && Boolean(createForm.tutorId),
    meta: { inline: true }
  })
  const createTutorSubjectsLoading = tutorSubjectsResult.isFetching
  const tutorSubjectIds = isCreateOpen && createForm.tutorId ? (tutorSubjectsResult.data ?? noSubjectIds) : noSubjectIds
  const createTutorSubjectIds = React.useMemo(() => new Set(tutorSubjectIds), [tutorSubjectIds])

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
      search: searchParams.get('lessonQ') ?? '',
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
      search: currentFilters.search,
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

  const lessonsQuery = React.useMemo(() => {
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
    // The field keeps what is typed (spaces included); the search ignores spaces at the ends.
    if (currentFilters.search.trim()) {
      params.set('q', currentFilters.search.trim())
    }
    params.set('sortBy', currentFilters.sortBy)
    params.set('sortDir', currentFilters.sortDir)
    params.set('limit', String(pageSize))
    params.set('offset', String((currentFilters.page - 1) * pageSize))
    return params.toString()
  }, [currentFilters])
  const lessonsResult = useQuery({
    queryKey: ['lessons', lessonsQuery],
    queryFn: async () => {
      const payload = await apiFetch<{ total?: number }>(`/api/lessons?${lessonsQuery}`, 'Impossibile caricare le lezioni.')
      const items = extractPayloadArray<Lesson>(payload)
      return { items, total: typeof payload?.total === 'number' ? payload.total : items.length }
    },
    // The rows stay in place while the next page or filter loads.
    placeholderData: keepPreviousData
  })
  const lessons = lessonsResult.data?.items ?? noLessons
  const total = lessonsResult.data?.total ?? 0
  const isLoading = lessonsResult.isFetching

  const appliedFilters = React.useMemo(
    () => ({
      search: currentFilters.search,
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
      const nextSearch = updates.search ?? base.search
      const nextTutor = updates.tutorId ?? base.tutorId
      const nextSubject = updates.subjectId ?? base.subjectId
      const nextStatus = updates.status ?? base.status
      const nextRange = updates.dateRange ?? base.dateRange
      const nextSortBy = updates.sortBy ?? base.sortBy
      const nextSortDir = updates.sortDir ?? base.sortDir
      const nextPage = updates.page ?? 1

      if (nextSearch.trim()) {
        params.set('lessonQ', nextSearch)
      } else {
        params.delete('lessonQ')
      }

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
        search: '',
        tutorId: '',
        subjectId: '',
        status: '',
        sortBy: currentFilters.sortBy,
        sortDir: currentFilters.sortDir,
        dateRange: undefined,
        page: 1
      },
      defaultFilters
    )
  }, [currentFilters.sortBy, currentFilters.sortDir, updateParams])

  const handleOpenCreate = React.useCallback(() => {
    setCreateForm({
      tutorId: '',
      subjectId: '',
      date: undefined,
      time: '15:00'
    })
    setIsCreateOpen(true)
  }, [])

  const createLesson = useMutation({
    mutationFn: (body: { tutorId: string, subjectId: string | null, startAt: string }) =>
      apiFetch<{ lessonId?: string, id?: string }>('/api/lessons', 'Impossibile creare la lezione.', jsonBody('POST', { ...body, durationMinutes: 60 })),
    onSuccess: async (payload) => {
      toast.success('Lezione creata.')
      setIsCreateOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['lessons'] })
      const createdLessonId = (payload?.lessonId ?? payload?.id ?? '').trim()
      if (createdLessonId) router.push(withFrom(`/admin/lessons/${createdLessonId}`, here))
    }
  })
  const isCreating = createLesson.isPending

  const handleCreate = () => {
    if (!createForm.tutorId.trim()) {
      toast.error('Seleziona un tutor valido.')
      return
    }
    if (!createForm.date) {
      toast.error('Inserisci una data valida.')
      return
    }
    const timeValue = AVAILABLE_TIMES.includes(createForm.time)
      ? createForm.time
      : '15:00'
    createLesson.mutate({
      tutorId: createForm.tutorId,
      // No subject: an open lesson, whose first booking picks one of the tutor's subjects.
      subjectId: createForm.subjectId || null,
      startAt: combineDateAndTime(createForm.date, timeValue).toISOString()
    })
  }

  const firstLoad = useFirstLoad(isLoading)
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <PageHeader
            title='Gestione lezioni'
            backHref='/admin'
            actions={<>
              {viewSwitch}
              <Button onClick={handleOpenCreate}>Crea lezione</Button>
            </>}
          />

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
              placeholder: 'Data, tutor, studente, materia o argomento'
            }}
            activeFilters={[filters.tutorId, filters.subjectId, filters.status, filters.dateRange?.from].filter(Boolean).length}
            onReset={handleClearFilters}
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
                      sortBy={currentFilters.sortBy}
                      sortDir={currentFilters.sortDir}
                      onSort={(key) => {
                        const next = { ...filters, ...nextSort(currentFilters, key, 'desc') }
                        setFilters(next)
                        updateParams({ sortBy: next.sortBy, sortDir: next.sortDir, page: 1 }, next)
                      }}
                    />
                  </TableHead>
                  <TableHead>Tutor</TableHead>
                  <TableHead>Materia</TableHead>
                  <TableHead className='whitespace-nowrap'>
                    Posti occupati
                  </TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={cn(isLoading && 'opacity-60 transition-opacity')} aria-busy={isLoading}>
                {firstLoad ? (
                  <TableSkeletonRows columns={5} />
                ) : lessons.length ? (
                  lessons.map((lesson) => {
                    const subject = lessonSubject(lesson.subjectId, subjectMap)
                    const tutor = tutorMap.get(lesson.tutorId)
                    return (
                      <TableRow
                        key={lesson.id}
                        className='cursor-pointer'
                        tabIndex={0}
                        onClick={() => router.push(withFrom(`/admin/lessons/${lesson.id}`, here))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') router.push(withFrom(`/admin/lessons/${lesson.id}`, here))
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

          <ListPagination page={currentFilters.page} pageSize={pageSize} total={total} onPageChange={(next) => updateParams({ page: next }, appliedFilters)} loading={isLoading} className='mt-4' />
        </div>
      </div>


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
                    <SelectItem value='__none__'>Nessuna: la sceglie la prima prenotazione</SelectItem>
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
              <>
                <Field className='gap-2'>
                  <Label htmlFor='create-date'>Data</Label>
                  <DatePicker
                    id='create-date'
                    value={createForm.date}
                    onChange={(date) => setCreateForm((prev) => ({ ...prev, date }))}
                    disabled={schoolDays.disabled}
                    modifiers={schoolDays.modifiers}
                  />
                </Field>
                <Field className='gap-2'>
                  <Label htmlFor='create-time'>Orario</Label>
                  <Select
                    value={createForm.time}
                    onValueChange={(value) => setCreateForm((prev) => ({ ...prev, time: value }))}
                  >
                    <SelectTrigger id='create-time' className='w-full'>
                      <SelectValue placeholder='Scegli l’orario' />
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
              </>
            </div>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleCreate()
              }}
              disabled={isCreating}
            >
              {isCreating ? 'Salvataggio...' : 'Crea lezione'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </main>
  )
}
