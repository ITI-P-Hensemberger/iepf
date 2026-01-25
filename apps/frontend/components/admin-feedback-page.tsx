'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarIcon, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

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
import { BackButton } from '@/components/back-button'
import { Calendar } from '@/components/ui/calendar'
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
import { format } from 'date-fns'
import { type DateRange } from 'react-day-picker'
import { Label } from './ui/label'

const pageSize = 20
const commentPreviewLimit = 90

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
  lessonId: '',
  authorUserId: '',
  targetUserId: '',
  authorRole: 'student',
  rating: '',
  dateRange: undefined,
  sortBy: 'lessonStartAt',
  sortDir: 'desc'
}

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
  const searchParamsString = searchParams.toString()

  const [filters, setFilters] = React.useState<FeedbackFilters>(defaultFilters)
  const [feedback, setFeedback] = React.useState<Feedback[]>([])
  const [total, setTotal] = React.useState(0)
  const [isLoading, setIsLoading] = React.useState(true)
  const [usersLoading, setUsersLoading] = React.useState(false)
  const [students, setStudents] = React.useState<User[]>([])
  const [tutors, setTutors] = React.useState<User[]>([])
  const [subjects, setSubjects] = React.useState<Subject[]>([])
  const [lessonMap, setLessonMap] = React.useState<Record<string, LessonInfo>>(
    {}
  )
  const [isFilterDateDialogOpen, setIsFilterDateDialogOpen] =
    React.useState(false)

  const [editTarget, setEditTarget] = React.useState<Feedback | null>(null)
  const [editForm, setEditForm] = React.useState({ rating: '', text: '' })
  const [isUpdating, setIsUpdating] = React.useState(false)

  const [deleteTarget, setDeleteTarget] = React.useState<Feedback | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

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

  const loadFeedback = React.useCallback(async () => {
    setIsLoading(true)
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
    params.set('sortBy', currentFilters.sortBy)
    params.set('sortDir', currentFilters.sortDir)
    params.set('limit', String(pageSize))
    params.set('offset', String((currentFilters.page - 1) * pageSize))

    try {
      const response = await fetch(`/api/feedback?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare i feedback.')
      }
      const payload = await response.json()
      const { items, total } = normalizePaged<Feedback>(payload)
      setFeedback(items)
      setTotal(total)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile caricare i feedback.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [currentFilters])

  React.useEffect(() => {
    void loadFeedback()
  }, [loadFeedback])

  const loadUsers = React.useCallback(async () => {
    setUsersLoading(true)
    try {
      const [studentsResponse, tutorsResponse] = await Promise.all([
        fetch('/api/users?role=student&limit=200&offset=0'),
        fetch('/api/users?role=tutor&limit=200&offset=0')
      ])

      if (studentsResponse.ok) {
        const payload = await studentsResponse.json()
        const { items } = normalizePaged<User>(payload)
        setStudents(items)
      }
      if (tutorsResponse.ok) {
        const payload = await tutorsResponse.json()
        const { items } = normalizePaged<User>(payload)
        setTutors(items)
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile caricare gli utenti.'
      )
    } finally {
      setUsersLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const loadSubjects = React.useCallback(async () => {
    try {
      const response = await fetch('/api/subjects')
      if (!response.ok) {
        return
      }
      const payload = await response.json()
      setSubjects(extractPayloadArray<Subject>(payload))
    } catch {
      // ignore subject errors for now
    }
  }, [])

  React.useEffect(() => {
    void loadSubjects()
  }, [loadSubjects])

  React.useEffect(() => {
    if (!feedback.length) return
    const uniqueLessonIds = Array.from(
      new Set(feedback.map((item) => item.lessonId).filter(Boolean))
    )
    const missingIds = uniqueLessonIds.filter((id) => !lessonMap[id])
    if (!missingIds.length) return

    let isCancelled = false
    void (async () => {
      const results = await Promise.all(
        missingIds.map(async (lessonId) => {
          try {
            const response = await fetch(`/api/lessons/${lessonId}`)
            if (!response.ok) return null
            const payload = await response.json()
            const lesson = extractPayloadObject<LessonInfo>(payload)
            return lesson ? { lessonId, lesson } : null
          } catch {
            return null
          }
        })
      )
      if (isCancelled) return
      setLessonMap((prev) => {
        const next = { ...prev }
        results.forEach((result) => {
          if (result?.lesson) {
            next[result.lessonId] = result.lesson
          }
        })
        return next
      })
    })()

    return () => {
      isCancelled = true
    }
  }, [feedback, lessonMap])

  const userMap = React.useMemo(() => {
    const map = new Map<string, User>()
    students.forEach((user) => map.set(user.id, user))
    tutors.forEach((user) => map.set(user.id, user))
    return map
  }, [students, tutors])

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

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
      await loadFeedback()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile aggiornare il feedback.'
      )
    } finally {
      setIsUpdating(false)
    }
  }, [editForm, editTarget, loadFeedback])

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
      await loadFeedback()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile eliminare il feedback.'
      )
    } finally {
      setIsDeleting(false)
    }
  }, [deleteTarget, loadFeedback])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <div className='mb-6'>
            <BackButton />
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Gestione feedback</h1>
          </div>

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
              <div className='rounded-lg border bg-card p-4 shadow-sm'>
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
                    <Button
                      variant='outline'
                      id='feedback-date-range-student'
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
                            sortBy: value as FeedbackFilters['sortBy']
                          }))
                        }
                      >
                        <SelectTrigger className='w-full sm:w-[180px]'>
                          <SelectValue placeholder='Ordinamento' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='lessonStartAt'>
                            Data lezione
                          </SelectItem>
                          <SelectItem value='rating'>Rating</SelectItem>
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
                            sortDir: value === 'asc' ? 'asc' : 'desc'
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
                    <Button
                      variant='outline'
                      onClick={() =>
                        updateParams(1, {
                          ...defaultFilters,
                          authorRole: filters.authorRole
                        })
                      }
                    >
                      Reset filtri
                    </Button>
                    <Button onClick={() => updateParams(1, filters)}>
                      Applica filtri
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value='tutor' className='mt-6'>
              <div className='rounded-lg border bg-card p-4 shadow-sm'>
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
                    <Button
                      variant='outline'
                      id='feedback-date-range-tutor'
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
                            sortBy: value as FeedbackFilters['sortBy']
                          }))
                        }
                      >
                        <SelectTrigger className='w-full sm:w-[180px]'>
                          <SelectValue placeholder='Ordinamento' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='lessonStartAt'>
                            Data lezione
                          </SelectItem>
                          <SelectItem value='rating'>Rating</SelectItem>
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
                            sortDir: value === 'asc' ? 'asc' : 'desc'
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
                    <Button
                      variant='outline'
                      onClick={() =>
                        updateParams(1, {
                          ...defaultFilters,
                          authorRole: filters.authorRole
                        })
                      }
                    >
                      Reset filtri
                    </Button>
                    <Button onClick={() => updateParams(1, filters)}>
                      Applica filtri
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <div className='mt-6 rounded-lg border'>
            <Table>
              <TableHeader className='bg-muted/50'>
                <TableRow>
                  <TableHead>Lezione</TableHead>
                  <TableHead>Autore</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className='w-80'>Testo</TableHead>
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
                ) : feedback.length ? (
                  feedback.map((item) => {
                    const authorUser = userMap.get(item.authorUserId)
                    const targetUser = userMap.get(item.targetUserId)
                    const lessonInfo = lessonMap[item.lessonId]
                    const subjectName = lessonInfo?.subjectId
                      ? subjectMap.get(lessonInfo.subjectId)?.name
                      : undefined
                    const lessonDateLabel = lessonInfo?.startAt
                      ? formatItalianDate(lessonInfo.startAt)
                      : shortId(item.lessonId)
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className='flex items-start gap-2'>
                            <div className='space-y-1' title={item.lessonId}>
                              <div className='text-sm'>{lessonDateLabel}</div>
                              <div className='text-xs text-muted-foreground'>
                                {subjectName ?? '-'}
                              </div>
                            </div>
                            <Button
                              asChild
                              variant='ghost'
                              size='icon'
                              className='h-6 w-6 p-0'
                              aria-label='Apri lezione'
                            >
                              <Link href={`/admin/lessons/${item.lessonId}`}>
                                <ExternalLink className='h-4 w-4' />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <span title={item.authorUserId}>
                              {authorUser
                                ? `${authorUser.lastName} ${authorUser.firstName}`.trim() ||
                                  shortId(item.authorUserId)
                                : shortId(item.authorUserId)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <span title={item.targetUserId}>
                              {targetUser
                                ? `${targetUser.lastName} ${targetUser.firstName}`.trim() ||
                                  shortId(item.targetUserId)
                                : shortId(item.targetUserId)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{item.rating}</TableCell>
                        <TableCell className='w-80' title={item.text ?? ''}>
                          {item.text
                            ? item.text.length > commentPreviewLimit
                              ? `${item.text.slice(0, commentPreviewLimit)}…`
                              : item.text
                            : '-'}
                        </TableCell>
                        <TableCell className='w-16 text-right'>
                          <div className='flex items-center justify-end gap-1'>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-6 w-6 p-0'
                              aria-label='Modifica feedback'
                              onClick={() => handleOpenEdit(item)}
                            >
                              <Pencil className='h-4 w-4' />
                            </Button>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-6 w-6 p-0 text-destructive'
                              aria-label='Elimina feedback'
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className='text-muted-foreground'>
                      Nessun feedback trovato.
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
                onClick={() => updateParams(currentFilters.page - 1, filters)}
                disabled={currentFilters.page <= 1 || isLoading}
              >
                Precedente
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => updateParams(currentFilters.page + 1, filters)}
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
              Scegli l&apos;intervallo di date per filtrare i feedback.
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
              Aggiorna il rating o il testo del feedback selezionato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <Field className='gap-2'>
              <Label>Rating *</Label>
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
                  <SelectValue placeholder='Seleziona rating' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Seleziona rating</SelectItem>
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
                  setEditForm((prev) => ({ ...prev, text: event.target.value }))
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
              Questa azione è irreversibile.
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
              <div>Rating: {deleteTarget.rating}</div>
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
    </main>
  )
}
