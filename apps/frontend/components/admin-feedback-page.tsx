'use client'

import { DateRangePicker } from '@/components/date-picker'

import { nextSort, SortableHead } from '@/components/sortable-head'
import { ListPagination } from '@/components/list-pagination'
import { TableSkeletonRows, useFirstLoad } from '@/components/loading'
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { History, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

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
import { Button } from '@/components/ui/button'
import { FilterForm } from '@/components/filter-form'
import { PageHeader } from '@/components/page-header'
import { useBackHref, useHere, withFrom } from '@/lib/back-link'
import { Field, FieldLabel } from '@/components/ui/field'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { extractPayloadArray } from '@/lib/backend-response'
import { formatItalianDate } from '@/lib/format-date'
import { type DateRange } from 'react-day-picker'
import { Label } from './ui/label'
import { capitalizeFirst } from '@/lib/capitalize'
import { FeedbackHistory, FeedbackHistoryToggle } from '@/components/feedback-history'
import { StarRating } from '@/components/star-rating'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const pageSize = 20

type Feedback = {
  id: string
  lessonId: string
  bookingId: string
  authorUserId: string
  targetUserId: string
  authorRole: 'student' | 'tutor'
  rating: number
  text?: string | null
  createdAt: string
  updatedAt: string
  versionCount?: number
  lastEditorRole?: string | null
  deletedAt?: string | null
}

type User = {
  id: string
  firstName: string
  lastName: string
  role?: string | null
}

type LessonInfo = {
  id: string
  subjectId?: string | null
  startAt?: string | null
}

type Subject = {
  id: string
  name: string
}

type PagedPayloadObject<T> = {
  items?: T[]
  total?: number
  data?: PagedPayloadObject<T>
  rows?: T[]
  results?: T[]
}

type FeedbackFilters = {
  search: string
  lessonId: string
  authorUserId: string
  targetUserId: string
  authorRole: 'student' | 'tutor'
  rating: string
  dateRange?: DateRange
  sortBy: 'lessonStartAt' | 'rating' | 'createdAt'
  sortDir: 'asc' | 'desc'
}

const defaultFilters: FeedbackFilters = {
  search: '',
  lessonId: '',
  authorUserId: '',
  targetUserId: '',
  authorRole: 'student',
  rating: '',
  dateRange: undefined,
  sortBy: 'lessonStartAt',
  sortDir: 'desc'
}

// Stable empty lists, so memos keyed on them do not rerun while data loads.
const noUsers: User[] = []
const noSubjects: Subject[] = []

function normalizePaged<T>(payload: unknown): { items: T[]; total: number } {
  if (!payload) {
    return { items: [], total: 0 }
  }
  if (Array.isArray(payload)) {
    return { items: payload as T[], total: payload.length }
  }
  if (typeof payload !== 'object' || payload === null) {
    return { items: [], total: 0 }
  }

  const candidate = payload as PagedPayloadObject<T>
  const items = Array.isArray(candidate.items)
    ? candidate.items
    : Array.isArray(candidate.rows)
      ? candidate.rows
      : Array.isArray(candidate.results)
        ? candidate.results
        : Array.isArray((candidate as Record<string, unknown>).data)
          ? (candidate as Record<string, unknown>).data
          : []
  const total =
    typeof candidate.total === 'number'
      ? candidate.total
      : Array.isArray(candidate.items)
        ? candidate.items.length
        : Array.isArray(candidate.rows)
          ? candidate.rows.length
          : Array.isArray(candidate.results)
            ? candidate.results.length
            : Array.isArray(candidate.data?.items)
              ? candidate.data!.items!.length
              : Array.isArray(candidate.data?.rows)
                ? candidate.data!.rows!.length
                : Array.isArray(candidate.data?.results)
                  ? candidate.data!.results!.length
                  : 0
  return { items: items as T[], total }
}

function shortId(value?: string | null) {
  if (!value) return '-'
  return value.length > 8 ? `${value.slice(0, 8)}…` : value
}

function parseSortParam(value: string | null) {
  if (!value) {
    return null
  }
  const [sortBy, direction] = value.split(':')
  if (!sortBy) {
    return null
  }
  const sortDir: 'asc' | 'desc' = direction === 'asc' ? 'asc' : 'desc'
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

function extractPayloadObject<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const candidate = payload as Record<string, unknown>
  if (candidate.data && typeof candidate.data === 'object') {
    return candidate.data as T
  }
  return payload as T
}

export default function AdminFeedbackPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const backHref = useBackHref('/admin')
  const here = useHere()
  const searchParamsString = searchParams.toString()

  const [filters, setFilters] = React.useState<FeedbackFilters>(defaultFilters)

  const [editTarget, setEditTarget] = React.useState<Feedback | null>(null)
  const [editForm, setEditForm] = React.useState({ rating: '', text: '' })
  const [isUpdating, setIsUpdating] = React.useState(false)

  const [deleteTarget, setDeleteTarget] = React.useState<Feedback | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [detailTarget, setDetailTarget] = React.useState<Feedback | null>(null)
  // Deleted feedback stays in the history: shown on request, marked, never editable.
  const [showDeleted, setShowDeleted] = React.useState(false)

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

  const currentFilters = React.useMemo<
    FeedbackFilters & { page: number }
  >(() => {
    const sortParam = parseSortParam(searchParams.get('feedbackSort'))
    const sortBy =
      sortParam?.sortBy === 'rating' ||
      sortParam?.sortBy === 'createdAt' ||
      sortParam?.sortBy === 'lessonStartAt'
        ? (sortParam.sortBy as FeedbackFilters['sortBy'])
        : defaultFilters.sortBy
    const fromParam =
      parseDateParam(searchParams.get('feedbackLessonFrom')) ??
      parseDateParam(searchParams.get('feedbackFrom'))
    const toParam =
      parseDateParam(searchParams.get('feedbackLessonTo')) ??
      parseDateParam(searchParams.get('feedbackTo'))
    const roleParam =
      searchParams.get('feedbackRole') === 'tutor' ? 'tutor' : 'student'
    return {
      search: searchParams.get('feedbackQ') ?? '',
      lessonId: searchParams.get('feedbackLesson') ?? '',
      authorUserId: searchParams.get('feedbackAuthor') ?? '',
      targetUserId: searchParams.get('feedbackTarget') ?? '',
      authorRole: roleParam,
      rating: searchParams.get('feedbackRating') ?? '',
      dateRange:
        fromParam || toParam
          ? {
              from: fromParam,
              to: toParam
            }
          : undefined,
      sortBy,
      sortDir: sortParam?.sortDir === 'asc' ? 'asc' : 'desc',
      page: parsePage('feedbackPage')
    }
  }, [parsePage, searchParams])

  React.useEffect(() => {
    setFilters((prev) => {
      const next = {
        search: currentFilters.search,
        lessonId: currentFilters.lessonId,
        authorUserId: currentFilters.authorUserId,
        targetUserId: currentFilters.targetUserId,
        authorRole: currentFilters.authorRole,
        rating: currentFilters.rating,
        dateRange: currentFilters.dateRange,
        sortBy: currentFilters.sortBy,
        sortDir: currentFilters.sortDir
      }
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
    })
  }, [currentFilters])

  const updateParams = React.useCallback(
    (nextPage: number, nextFilters: FeedbackFilters) => {
      const params = new URLSearchParams(searchParamsString)

      if (nextFilters.search.trim()) {
        params.set('feedbackQ', nextFilters.search)
      } else {
        params.delete('feedbackQ')
      }
      if (nextFilters.lessonId) {
        params.set('feedbackLesson', nextFilters.lessonId)
      } else {
        params.delete('feedbackLesson')
      }
      if (nextFilters.authorUserId) {
        params.set('feedbackAuthor', nextFilters.authorUserId)
      } else {
        params.delete('feedbackAuthor')
      }
      if (nextFilters.targetUserId) {
        params.set('feedbackTarget', nextFilters.targetUserId)
      } else {
        params.delete('feedbackTarget')
      }
      if (nextFilters.authorRole) {
        params.set('feedbackRole', nextFilters.authorRole)
      } else {
        params.delete('feedbackRole')
      }
      if (nextFilters.rating) {
        params.set('feedbackRating', nextFilters.rating)
      } else {
        params.delete('feedbackRating')
      }
      if (nextFilters.dateRange?.from) {
        params.set(
          'feedbackLessonFrom',
          startOfDayIso(nextFilters.dateRange.from)
        )
      } else {
        params.delete('feedbackLessonFrom')
      }
      if (nextFilters.dateRange?.to) {
        params.set('feedbackLessonTo', endOfDayIso(nextFilters.dateRange.to))
      } else {
        params.delete('feedbackLessonTo')
      }
      params.delete('feedbackFrom')
      params.delete('feedbackTo')

      params.set('feedbackSort', `${nextFilters.sortBy}:${nextFilters.sortDir}`)

      if (nextPage > 1) {
        params.set('feedbackPage', String(nextPage))
      } else {
        params.delete('feedbackPage')
      }

      const nextParams = params.toString()
      const url = nextParams ? `${pathname}?${nextParams}` : pathname
      router.replace(url, { scroll: false })
    },
    [pathname, router, searchParamsString]
  )

  const feedbackQuery = React.useMemo(() => {
    const params = new URLSearchParams()
    if (currentFilters.lessonId) {
      params.set('lessonId', currentFilters.lessonId)
    }
    if (currentFilters.authorUserId) {
      params.set('authorUserId', currentFilters.authorUserId)
    }
    if (currentFilters.targetUserId) {
      params.set('targetUserId', currentFilters.targetUserId)
    }
    if (currentFilters.authorRole) {
      params.set('authorRole', currentFilters.authorRole)
    }
    if (currentFilters.rating) {
      params.set('rating', currentFilters.rating)
    }
    if (currentFilters.dateRange?.from) {
      params.set('lessonFrom', startOfDayIso(currentFilters.dateRange.from))
    }
    if (currentFilters.dateRange?.to) {
      params.set('lessonTo', endOfDayIso(currentFilters.dateRange.to))
    }
    // The field keeps what is typed (spaces included); the search ignores spaces at the ends.
    if (currentFilters.search.trim()) {
      params.set('q', currentFilters.search.trim())
    }
    params.set('sortBy', currentFilters.sortBy)
    params.set('sortDir', currentFilters.sortDir)
    if (showDeleted) {
      params.set('includeDeleted', 'true')
    }
    params.set('limit', String(pageSize))
    params.set('offset', String((currentFilters.page - 1) * pageSize))
    return params.toString()
  }, [currentFilters, showDeleted])

  const queryClient = useQueryClient()
  const feedbackResult = useQuery({
    queryKey: ['feedback', feedbackQuery],
    queryFn: async () => {
      const response = await fetch(`/api/feedback?${feedbackQuery}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare i feedback.')
      }
      return normalizePaged<Feedback>(await response.json())
    },
    // The rows stay in place while the next page or filter loads.
    placeholderData: keepPreviousData
  })
  const feedback = feedbackResult.data?.items ?? []
  const total = feedbackResult.data?.total ?? 0
  const isLoading = feedbackResult.isFetching

  const usersResult = useQuery({
    queryKey: ['users', 'students-and-tutors'],
    queryFn: async () => {
      const [studentsResponse, tutorsResponse] = await Promise.all([
        fetch('/api/users?role=student&limit=200&offset=0'),
        fetch('/api/users?role=tutor&limit=200&offset=0')
      ]).catch(() => {
        throw new Error('Impossibile caricare gli utenti.')
      })
      return {
        students: studentsResponse.ok ? normalizePaged<User>(await studentsResponse.json()).items : [],
        tutors: tutorsResponse.ok ? normalizePaged<User>(await tutorsResponse.json()).items : []
      }
    }
  })
  const students = usersResult.data?.students ?? noUsers
  const tutors = usersResult.data?.tutors ?? noUsers
  const usersLoading = usersResult.isFetching

  // Subjects only name things in the list: without them the page still works, so no toast.
  const { data: subjects = noSubjects } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => {
      const response = await fetch('/api/subjects').catch(() => null)
      return response?.ok ? extractPayloadArray<Subject>(await response.json()) : []
    }
  })

  // Each lesson once, cached across pages; a lesson that fails to load is just left out.
  const lessonIds = Array.from(new Set(feedback.map((item) => item.lessonId).filter(Boolean)))
  const lessonResults = useQueries({
    queries: lessonIds.map((lessonId) => ({
      queryKey: ['lesson', lessonId],
      queryFn: async () => {
        const response = await fetch(`/api/lessons/${lessonId}`).catch(() => null)
        return response?.ok ? extractPayloadObject<LessonInfo>(await response.json()) : null
      },
      staleTime: Infinity
    }))
  })
  const lessonMap: Record<string, LessonInfo> = {}
  lessonResults.forEach((result, index) => {
    if (result.data) lessonMap[lessonIds[index]] = result.data
  })

  const reloadFeedback = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['feedback'] }),
    [queryClient]
  )

  const userMap = React.useMemo(() => {
    const map = new Map<string, User>()
    students.forEach((user) => map.set(user.id, user))
    tutors.forEach((user) => map.set(user.id, user))
    return map
  }, [students, tutors])

  const personName = React.useCallback((id: string) => {
    const user = userMap.get(id)
    return user ? `${user.firstName} ${user.lastName}`.trim() || shortId(id) : shortId(id)
  }, [userMap])

  const subjectMap = React.useMemo(() => {
    const map = new Map<string, Subject>()
    subjects.forEach((subject) => map.set(subject.id, subject))
    return map
  }, [subjects])

  const authorOptions = filters.authorRole === 'student' ? students : tutors
  const targetOptions = filters.authorRole === 'student' ? tutors : students

  const userLabel = React.useCallback((user?: User | null) => {
    if (!user) return '-'
    const name = `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim()
    return `${name || user.id}`
  }, [])


  const handleOpenEdit = React.useCallback((item: Feedback) => {
    setEditTarget(item)
    setEditForm({
      rating: String(item.rating ?? ''),
      text: item.text ?? ''
    })
  }, [])

  const handleUpdate = React.useCallback(async () => {
    if (!editTarget) return

    const ratingValue = Number(editForm.rating)
    if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      toast.error('Il rating deve essere compreso tra 1 e 5.')
      return
    }

    setIsUpdating(true)
    try {
      const response = await fetch(`/api/feedback/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: ratingValue,
          text: editForm.text.trim() || undefined
        })
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(
          payload?.message || 'Impossibile aggiornare il feedback.'
        )
      }
      toast.success('Feedback aggiornato.')
      setEditTarget(null)
      await reloadFeedback()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile aggiornare il feedback.'
      )
    } finally {
      setIsUpdating(false)
    }
  }, [editForm, editTarget, reloadFeedback])

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/feedback/${deleteTarget.id}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(
          payload?.message || 'Impossibile eliminare il feedback.'
        )
      }
      toast.success('Feedback eliminato.')
      setDeleteTarget(null)
      await reloadFeedback()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile eliminare il feedback.'
      )
    } finally {
      setIsDeleting(false)
    }
  }, [deleteTarget, reloadFeedback])

  // The list under either tab: the same rows, filtered by the open tab.
  const firstLoad = useFirstLoad(isLoading)
  const results = (
    <>
        <label className='mt-4 flex items-center gap-2 text-sm text-muted-foreground'>
          <Switch checked={showDeleted} onCheckedChange={setShowDeleted} />
          Mostra anche i feedback eliminati
        </label>
        <div className='mt-3 rounded-lg border'>
          <Table>
            <TableHeader sticky className='bg-muted/50'>
              <TableRow>
                <TableHead>
                    <SortableHead
                      label='Lezione'
                      sortKey='lessonStartAt'
                      sortBy={currentFilters.sortBy}
                      sortDir={currentFilters.sortDir}
                      onSort={(key) => updateParams(1, { ...filters, ...nextSort(currentFilters, key, 'desc') as Pick<FeedbackFilters, 'sortBy' | 'sortDir'> })}
                    />
                  </TableHead>
                <TableHead>Da</TableHead>
                <TableHead>Per</TableHead>
                <TableHead>
                    <SortableHead
                      label='Valutazione'
                      sortKey='rating'
                      sortBy={currentFilters.sortBy}
                      sortDir={currentFilters.sortDir}
                      onSort={(key) => updateParams(1, { ...filters, ...nextSort(currentFilters, key, 'asc') as Pick<FeedbackFilters, 'sortBy' | 'sortDir'> })}
                    />
                  </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={cn(isLoading && 'opacity-60 transition-opacity')} aria-busy={isLoading}>
              {firstLoad ? (
                <TableSkeletonRows columns={4} />
              ) : feedback.length ? (
                feedback.map((item) => {
                  const lessonInfo = lessonMap[item.lessonId]
                  const subjectName = lessonInfo?.subjectId
                    ? subjectMap.get(lessonInfo.subjectId)?.name
                    : undefined
                  const edits = (item.versionCount ?? 1) - 1
                  // The whole row opens the feedback: text, history and actions live in the dialog.
                  return (
                    <TableRow
                      key={item.id}
                      tabIndex={0}
                      className={cn('cursor-pointer', item.deletedAt && 'opacity-60')}
                      onClick={() => setDetailTarget(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setDetailTarget(item)
                        }
                      }}
                    >
                      <TableCell>
                        <div className='text-sm'>{lessonInfo?.startAt ? formatItalianDate(lessonInfo.startAt) : shortId(item.lessonId)}</div>
                        <div className='text-xs text-muted-foreground'>{subjectName ?? '-'}</div>
                      </TableCell>
                      <TableCell>{personName(item.authorUserId)}</TableCell>
                      <TableCell>{personName(item.targetUserId)}</TableCell>
                      <TableCell>
                        <div className='flex flex-wrap items-center gap-2'>
                          <StarRating value={item.rating} size='sm' />
                          {item.deletedAt
                            ? <span className='text-xs text-destructive'>Eliminato</span>
                            : edits > 0 && (
                              <span className='inline-flex items-center gap-1 text-xs text-muted-foreground' title={`${edits} ${edits === 1 ? 'modifica' : 'modifiche'}`}>
                                <History className='h-3 w-3' aria-hidden />
                                {edits}
                              </span>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className='text-muted-foreground'>
                    Nessun feedback trovato.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
  
        <ListPagination page={currentFilters.page} pageSize={pageSize} total={total} onPageChange={(next) => updateParams(next, filters)} loading={isLoading} className='mt-4' />
    </>
  )

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <PageHeader title='Gestione feedback' backHref={backHref} />

          <Tabs
            value={filters.authorRole}
            onValueChange={(value) => {
              if (value !== 'student' && value !== 'tutor') {
                return
              }
              const nextRole = value as FeedbackFilters['authorRole']
              const nextFilters = {
                ...filters,
                authorRole: nextRole,
                authorUserId: '',
                targetUserId: ''
              }
              setFilters(nextFilters)
              updateParams(1, nextFilters)
            }}
          >
            <TabsList className='mt-6'>
              <TabsTrigger value='student'>Studenti → Tutor</TabsTrigger>
              <TabsTrigger value='tutor'>Tutor → Studenti</TabsTrigger>
            </TabsList>
            <TabsContent value='student' className='mt-6'>
              <FilterForm
                values={filters}
                applied={currentFilters}
                onSubmit={(event) => {
                  event.preventDefault()
                  updateParams(1, filters)
                }}
                search={{
                  id: `feedback-search-${filters.authorRole}`,
                  value: filters.search,
                  onChange: (value) => setFilters((prev) => ({ ...prev, search: value })),
                  placeholder: 'Nome o testo del feedback'
                }}
                activeFilters={[filters.authorUserId, filters.targetUserId, filters.rating, filters.dateRange?.from].filter(Boolean).length}
                onReset={() => updateParams(1, { ...defaultFilters, authorRole: filters.authorRole, sortBy: currentFilters.sortBy, sortDir: currentFilters.sortDir })}
              >
                <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                  <Field className='gap-2'>
                    <FieldLabel>Studente</FieldLabel>
                    <Select
                      value={filters.authorUserId || 'all'}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          authorUserId: value === 'all' ? '' : value
                        }))
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue
                          placeholder={
                            usersLoading ? 'Caricamento...' : 'Tutti'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>Tutti</SelectItem>
                        {authorOptions.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {userLabel(user)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className='gap-2'>
                    <FieldLabel>Tutor</FieldLabel>
                    <Select
                      value={filters.targetUserId || 'all'}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          targetUserId: value === 'all' ? '' : value
                        }))
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue
                          placeholder={
                            usersLoading ? 'Caricamento...' : 'Tutti'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>Tutti</SelectItem>
                        {targetOptions.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {userLabel(user)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className='gap-2'>
                    <FieldLabel>Rating</FieldLabel>
                    <Select
                      value={filters.rating || 'all'}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          rating: value === 'all' ? '' : value
                        }))
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='Tutti i rating' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>Tutti i rating</SelectItem>
                        <SelectItem value='1'>1</SelectItem>
                        <SelectItem value='2'>2</SelectItem>
                        <SelectItem value='3'>3</SelectItem>
                        <SelectItem value='4'>4</SelectItem>
                        <SelectItem value='5'>5</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className='gap-2'>
                    <FieldLabel htmlFor='feedback-date-range-student'>
                      Periodo
                    </FieldLabel>
                    <DateRangePicker id='feedback-date-range-student' value={filters.dateRange} onChange={(range) => setFilters((prev) => ({ ...prev, dateRange: range }))} />
                  </Field>
                </div>
              </FilterForm>
              {results}
            </TabsContent>
            <TabsContent value='tutor' className='mt-6'>
              <FilterForm
                values={filters}
                applied={currentFilters}
                onSubmit={(event) => {
                  event.preventDefault()
                  updateParams(1, filters)
                }}
                search={{
                  id: `feedback-search-${filters.authorRole}`,
                  value: filters.search,
                  onChange: (value) => setFilters((prev) => ({ ...prev, search: value })),
                  placeholder: 'Nome o testo del feedback'
                }}
                activeFilters={[filters.authorUserId, filters.targetUserId, filters.rating, filters.dateRange?.from].filter(Boolean).length}
                onReset={() => updateParams(1, { ...defaultFilters, authorRole: filters.authorRole, sortBy: currentFilters.sortBy, sortDir: currentFilters.sortDir })}
              >
                <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                  <Field className='gap-2'>
                    <FieldLabel>Tutor</FieldLabel>
                    <Select
                      value={filters.authorUserId || 'all'}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          authorUserId: value === 'all' ? '' : value
                        }))
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue
                          placeholder={
                            usersLoading ? 'Caricamento...' : 'Tutti'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>Tutti</SelectItem>
                        {authorOptions.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {userLabel(user)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className='gap-2'>
                    <FieldLabel>Studente</FieldLabel>
                    <Select
                      value={filters.targetUserId || 'all'}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          targetUserId: value === 'all' ? '' : value
                        }))
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue
                          placeholder={
                            usersLoading ? 'Caricamento...' : 'Tutti'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>Tutti</SelectItem>
                        {targetOptions.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {userLabel(user)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className='gap-2'>
                    <FieldLabel>Rating</FieldLabel>
                    <Select
                      value={filters.rating || 'all'}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          rating: value === 'all' ? '' : value
                        }))
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='Tutti i rating' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='all'>Tutti i rating</SelectItem>
                        <SelectItem value='1'>1</SelectItem>
                        <SelectItem value='2'>2</SelectItem>
                        <SelectItem value='3'>3</SelectItem>
                        <SelectItem value='4'>4</SelectItem>
                        <SelectItem value='5'>5</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className='gap-2'>
                    <FieldLabel htmlFor='feedback-date-range-tutor'>
                      Periodo
                    </FieldLabel>
                    <DateRangePicker id='feedback-date-range-tutor' value={filters.dateRange} onChange={(range) => setFilters((prev) => ({ ...prev, dateRange: range }))} />
                  </Field>
                </div>
              </FilterForm>
              {results}
            </TabsContent>
          </Tabs>
        </div>
      </div>


      <AlertDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifica feedback</AlertDialogTitle>
            <AlertDialogDescription>
              Aggiorna la valutazione o il testo del feedback selezionato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <Field className='gap-2'>
              <Label>Valutazione *</Label>
              <Select
                value={editForm.rating || 'all'}
                onValueChange={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    rating: value === 'all' ? '' : value
                  }))
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Seleziona valutazione' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Seleziona valutazione</SelectItem>
                  <SelectItem value='1'>1</SelectItem>
                  <SelectItem value='2'>2</SelectItem>
                  <SelectItem value='3'>3</SelectItem>
                  <SelectItem value='4'>4</SelectItem>
                  <SelectItem value='5'>5</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field className='gap-2'>
              <Label htmlFor='edit-text'>Testo</Label>
              <Textarea
                id='edit-text'
                value={editForm.text}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, text: capitalizeFirst(event.target.value) }))
                }
                placeholder='Aggiorna il testo'
                rows={4}
              />
            </Field>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleUpdate()
              }}
              disabled={isUpdating}
            >
              {isUpdating ? 'Salvataggio...' : 'Aggiorna'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              Sparisce per l&apos;autore e dalle statistiche. Resta nella cronologia, che gli admin vedono con &quot;Mostra anche i feedback eliminati&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget && (
            <div className='rounded-md border p-3 text-sm text-muted-foreground space-y-1'>
              <div>
                Lezione:{' '}
                {(() => {
                  const lesson = lessonMap[deleteTarget.lessonId]
                  const subject = lesson?.subjectId
                    ? subjectMap.get(lesson.subjectId)?.name
                    : null
                  if (lesson?.startAt) {
                    return `${formatItalianDate(lesson.startAt)}${
                      subject ? ` · ${subject}` : ''
                    }`
                  }
                  return shortId(deleteTarget.lessonId)
                })()}
              </div>
              <div>
                Autore:{' '}
                {(() => {
                  const author = userMap.get(deleteTarget.authorUserId)
                  return author
                    ? `${author.lastName} ${author.firstName}`.trim() ||
                        shortId(deleteTarget.authorUserId)
                    : shortId(deleteTarget.authorUserId)
                })()}
              </div>
              <div>
                Destinatario:{' '}
                {(() => {
                  const target = userMap.get(deleteTarget.targetUserId)
                  return target
                    ? `${target.lastName} ${target.firstName}`.trim() ||
                        shortId(deleteTarget.targetUserId)
                    : shortId(deleteTarget.targetUserId)
                })()}
              </div>
              <div>Valutazione: {deleteTarget.rating}</div>
            </div>
          )}
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={detailTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null)
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-2rem)] max-h-[calc(100dvh-3rem)] overflow-y-auto sm:max-w-xl'>
          {detailTarget && (() => {
            const lessonInfo = lessonMap[detailTarget.lessonId]
            const subjectName = lessonInfo?.subjectId ? subjectMap.get(lessonInfo.subjectId)?.name : undefined
            const roleLabel = detailTarget.authorRole === 'tutor' ? 'tutor' : 'studente'
            return (
              <>
                <AlertDialogHeader className='text-left sm:text-left'>
                  <AlertDialogTitle>
                    Feedback di {personName(detailTarget.authorUserId)} per {personName(detailTarget.targetUserId)}
                  </AlertDialogTitle>
                  <AlertDialogDescription className='text-left'>
                    Scritto dal {roleLabel}
                    {lessonInfo?.startAt ? ` · lezione del ${formatItalianDate(lessonInfo.startAt)}` : ''}
                    {subjectName ? ` · ${subjectName}` : ''}
                    {' · '}
                    <Link href={withFrom(`/admin/lessons/${detailTarget.lessonId}`, here)} className='underline underline-offset-4'>
                      Apri lezione
                    </Link>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className='space-y-3'>
                  <StarRating value={detailTarget.rating} />
                  <p className='rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap'>
                    {detailTarget.text || <span className='text-muted-foreground'>Nessun testo</span>}
                  </p>
                  {detailTarget.deletedAt
                    ? <FeedbackHistory feedbackId={detailTarget.id} audience='admin' />
                    : (
                        <FeedbackHistoryToggle
                          feedbackId={detailTarget.id}
                          versionCount={detailTarget.versionCount ?? 1}
                          lastEditorRole={detailTarget.lastEditorRole ?? null}
                          audience='admin'
                        />
                      )}
                </div>
                <AlertDialogFooter className='gap-2'>
                  <AlertDialogCancel>Chiudi</AlertDialogCancel>
                  {!detailTarget.deletedAt && (
                    <>
                      <Button
                        type='button'
                        variant='outline'
                        className='text-destructive hover:text-destructive'
                        onClick={() => {
                          setDeleteTarget(detailTarget)
                          setDetailTarget(null)
                        }}
                      >
                        <Trash2 className='h-4 w-4' /> Elimina
                      </Button>
                      <Button
                        type='button'
                        onClick={() => {
                          handleOpenEdit(detailTarget)
                          setDetailTarget(null)
                        }}
                      >
                        <Pencil className='h-4 w-4' /> Modifica
                      </Button>
                    </>
                  )}
                </AlertDialogFooter>
              </>
            )
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
