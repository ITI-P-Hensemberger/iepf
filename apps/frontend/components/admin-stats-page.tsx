'use client'

import * as React from 'react'

import { PushCoverageCard } from '@/components/push-coverage-card'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { toast } from 'sonner'

import { BackButton } from '@/components/back-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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

const pageSize = 20

type SubjectTutorCount = {
  subjectId: string
  name: string
  canonicalName: string
  tutorCount: number
}

type SubjectRequestSummary = {
  subjectName: string
  canonicalName: string
  requestCount: number
}

type LessonCountRow = {
  tutorId?: string
  studentId?: string
  email: string
  firstName: string
  lastName: string
  sectionName: string | null
  countedLessons: number
  inviteCount?: number
  invitesCount?: number
}

type UserExportRow = {
  id?: string
  firstName: string
  lastName: string
  email: string
  sectionName?: string | null
  year?: number | null
  isActive?: boolean | null
  lessonTokens?: number | null
}

type StudentExportStatsRow = {
  studentId: string
  lessonsPresentCounted: number
  lessonsPresentNotCounted: number
  lessonsAbsentCounted: number
  lessonsAbsentNotCounted: number
  lessonsWithoutPresenceCounted: number
  lessonsWithoutPresenceNotCounted: number
}

type TutorExportStatsRow = {
  tutorId: string
  lessonsScheduledCounted: number
  lessonsScheduledNotCounted: number
  lessonsConfirmedCounted: number
  lessonsConfirmedNotCounted: number
  lessonsCancelledCounted: number
  lessonsCancelledNotCounted: number
  lessonsCompletedCounted: number
  lessonsCompletedNotCounted: number
}

type FeedbackSummary = {
  total: number
  studentAuthored: number
  tutorAuthored: number
  averageRating: number
  rating1: number
  rating2: number
  rating3: number
  rating4: number
  rating5: number
  studentToTutorTotal: number
  studentToTutorAverageRating: number
  studentToTutorRating1: number
  studentToTutorRating2: number
  studentToTutorRating3: number
  studentToTutorRating4: number
  studentToTutorRating5: number
  tutorToStudentTotal: number
  tutorToStudentAverageRating: number
  tutorToStudentRating1: number
  tutorToStudentRating2: number
  tutorToStudentRating3: number
  tutorToStudentRating4: number
  tutorToStudentRating5: number
}

type FeedbackExportRow = {
  id: string
  lessonId: string
  bookingId: string
  authorUserId: string
  targetUserId: string
  authorRole: 'student' | 'tutor'
  rating: number
  text: string | null
  createdAt: string
  updatedAt: string
}

type Totals = {
  lessonsConfirmed: number
  bookingsConfirmed: number
  studentsActive: number
  studentsInactive: number
  studentsPending: number
  tutorsActive: number
  tutorsInactive: number
  tutorsInvites: number
}

type SortOption = {
  value: string
  label: string
}

const subjectsSortOptions: SortOption[] = [
  { value: 'name', label: 'Nome' },
  { value: 'canonicalName', label: 'Nome canonico' },
  { value: 'tutorCount', label: 'Tutor' }
]

const subjectRequestsSortOptions: SortOption[] = [
  { value: 'subjectName', label: 'Materia' },
  { value: 'requestCount', label: 'Richieste' }
]

const lessonsSortOptions: SortOption[] = [
  { value: 'lastName', label: 'Cognome' },
  { value: 'firstName', label: 'Nome' },
  { value: 'email', label: 'Email' },
  { value: 'sectionName', label: 'Sezione' },
  { value: 'countedLessons', label: 'Lezioni' }
]

const sortDirOptions: SortOption[] = [
  { value: 'asc', label: 'Crescente' },
  { value: 'desc', label: 'Decrescente' }
]

type StatsFilters = {
  search: string
  sortBy: string
  sortDir: 'asc' | 'desc'
}

type PagedPayloadObject<T> = {
  items?: T[]
  total?: number
  data?: PagedPayloadObject<T>
  rows?: T[]
  results?: T[]
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

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const normalized = value == null ? '' : String(value)
  const escaped = normalized.replaceAll('"', '""')
  return `"${escaped}"`
}

function buildStudentsCsv(
  rows: Array<
    Pick<
      UserExportRow,
      'firstName' | 'lastName' | 'email' | 'sectionName' | 'year' | 'isActive' | 'lessonTokens'
    > & Pick<
      StudentExportStatsRow,
      | 'lessonsPresentCounted'
      | 'lessonsPresentNotCounted'
      | 'lessonsAbsentCounted'
      | 'lessonsAbsentNotCounted'
      | 'lessonsWithoutPresenceCounted'
      | 'lessonsWithoutPresenceNotCounted'
    >
  >
) {
  const headers = [
    'firstName',
    'lastName',
    'email',
    'sectionName',
    'year',
    'isActive',
    'lessonTokens',
    'lessonsPresentCounted',
    'lessonsPresentNotCounted',
    'lessonsAbsentCounted',
    'lessonsAbsentNotCounted',
    'lessonsWithoutPresenceCounted',
    'lessonsWithoutPresenceNotCounted'
  ]

  const lines = [
    headers.map((header) => escapeCsvValue(header)).join(','),
    ...rows.map((row) =>
      [
        row.firstName,
        row.lastName,
        row.email,
        row.sectionName ?? '',
        row.year ?? '',
        row.isActive ?? '',
        row.lessonTokens ?? '',
        row.lessonsPresentCounted,
        row.lessonsPresentNotCounted,
        row.lessonsAbsentCounted,
        row.lessonsAbsentNotCounted,
        row.lessonsWithoutPresenceCounted,
        row.lessonsWithoutPresenceNotCounted
      ]
        .map((value) => escapeCsvValue(value))
        .join(',')
    )
  ]

  return lines.join('\n')
}

function buildTutorsCsv(
  rows: Array<
    Pick<
      UserExportRow,
      'firstName' | 'lastName' | 'email' | 'sectionName' | 'year' | 'isActive'
    > & Pick<
      TutorExportStatsRow,
      | 'lessonsScheduledCounted'
      | 'lessonsScheduledNotCounted'
      | 'lessonsConfirmedCounted'
      | 'lessonsConfirmedNotCounted'
      | 'lessonsCancelledCounted'
      | 'lessonsCancelledNotCounted'
      | 'lessonsCompletedCounted'
      | 'lessonsCompletedNotCounted'
    >
  >
) {
  const headers = [
    'firstName',
    'lastName',
    'email',
    'sectionName',
    'year',
    'isActive',
    'lessonsScheduledCounted',
    'lessonsScheduledNotCounted',
    'lessonsConfirmedCounted',
    'lessonsConfirmedNotCounted',
    'lessonsCancelledCounted',
    'lessonsCancelledNotCounted',
    'lessonsCompletedCounted',
    'lessonsCompletedNotCounted'
  ]

  const lines = [
    headers.map((header) => escapeCsvValue(header)).join(','),
    ...rows.map((row) =>
      [
        row.firstName,
        row.lastName,
        row.email,
        row.sectionName ?? '',
        row.year ?? '',
        row.isActive ?? '',
        row.lessonsScheduledCounted,
        row.lessonsScheduledNotCounted,
        row.lessonsConfirmedCounted,
        row.lessonsConfirmedNotCounted,
        row.lessonsCancelledCounted,
        row.lessonsCancelledNotCounted,
        row.lessonsCompletedCounted,
        row.lessonsCompletedNotCounted
      ]
        .map((value) => escapeCsvValue(value))
        .join(',')
    )
  ]

  return lines.join('\n')
}

function buildFeedbackCsv(
  rows: Array<{
    id: string
    lessonId: string
    bookingId: string
    authorRole: string
    authorName: string
    authorEmail: string
    targetName: string
    targetEmail: string
    rating: number
    text: string | null
    createdAt: string
    updatedAt: string
  }>
) {
  const headers = [
    'id',
    'lessonId',
    'bookingId',
    'authorRole',
    'authorName',
    'authorEmail',
    'targetName',
    'targetEmail',
    'rating',
    'text',
    'createdAt',
    'updatedAt'
  ]

  const lines = [
    headers.map((header) => escapeCsvValue(header)).join(','),
    ...rows.map((row) =>
      [
        row.id,
        row.lessonId,
        row.bookingId,
        row.authorRole,
        row.authorName,
        row.authorEmail,
        row.targetName,
        row.targetEmail,
        row.rating,
        row.text ?? '',
        row.createdAt,
        row.updatedAt
      ]
        .map((value) => escapeCsvValue(value))
        .join(',')
    )
  ]

  return lines.join('\n')
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function buildExportFilename(role: 'student' | 'tutor') {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d{3}Z$/, '')
  const roleLabel = `${role}s`

  return `iepf-${roleLabel}-${timestamp}.csv`
}

function buildFeedbackExportFilename(role: 'student' | 'tutor') {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d{3}Z$/, '')

  return `iepf-feedback-${role}-${timestamp}.csv`
}

type DataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData>[]
  isLoading: boolean
  emptyMessage: string
  pageKey: string
  page: number
  pageSize: number
  total: number
  hasNext: boolean
}

function DataTable<TData>({
  data,
  columns,
  isLoading,
  emptyMessage,
  pageKey,
  page,
  pageSize,
  total,
  hasNext
}: DataTableProps<TData>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()

  const updatePage = React.useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParamsString)
      if (nextPage > 1) {
        params.set(pageKey, String(nextPage))
      } else {
        params.delete(pageKey)
      }
      const nextParams = params.toString()
      const url = nextParams ? `${pathname}?${nextParams}` : pathname
      router.replace(url, { scroll: false })
    },
    [pageKey, pathname, router, searchParamsString]
  )

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  return (
    <div className='space-y-4'>
      <div className='rounded-lg border'>
        <Table>
          <TableHeader className='bg-muted/50'>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  className='text-muted-foreground'
                  colSpan={columns.length}
                >
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className='text-muted-foreground'
                  colSpan={columns.length}
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className='flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
        <span>
          Pagina {page} di {totalPages} · Totale {total}
        </span>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => updatePage(page - 1)}
            disabled={page <= 1 || isLoading}
          >
            Precedente
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => updatePage(page + 1)}
            disabled={!hasNext || isLoading}
          >
            Successiva
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function AdminStatsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()

  const availableTabs = React.useMemo(
    () =>
      ['overview', 'subjects', 'subject-requests', 'tutors', 'students', 'feedback'] as const,
    []
  )

  const tabLabels = React.useMemo(
    () => ({
      overview: 'Panoramica',
      subjects: 'Materie',
      'subject-requests': 'Richieste materie',
      tutors: 'Tutor',
      students: 'Studenti',
      feedback: 'Feedback'
    }),
    []
  )

  const activeTab = React.useMemo(() => {
    const tab = searchParams.get('tab')
    if (tab && availableTabs.includes(tab as (typeof availableTabs)[number])) {
      return tab
    }
    return 'overview'
  }, [availableTabs, searchParams])

  const defaultSubjectsSortBy = 'name'
  const defaultSubjectRequestsSortBy = 'requestCount'
  const defaultLessonsSortBy = 'lastName'
  const defaultSortDir: 'asc' | 'desc' = 'asc'
  const defaultSubjectRequestsSortDir: 'asc' | 'desc' = 'desc'

  const [totals, setTotals] = React.useState<Totals>({
    lessonsConfirmed: 0,
    bookingsConfirmed: 0,
    studentsActive: 0,
    studentsInactive: 0,
    studentsPending: 0,
    tutorsActive: 0,
    tutorsInactive: 0,
    tutorsInvites: 0
  })
  const [totalsLoading, setTotalsLoading] = React.useState(true)

  const [subjects, setSubjects] = React.useState<SubjectTutorCount[]>([])
  const [subjectsLoading, setSubjectsLoading] = React.useState(false)
  const [subjectsFilters, setSubjectsFilters] = React.useState<StatsFilters>({
    search: '',
    sortBy: defaultSubjectsSortBy,
    sortDir: defaultSortDir
  })
  const [subjectsHasNext, setSubjectsHasNext] = React.useState(false)
  const [subjectsTotal, setSubjectsTotal] = React.useState(0)

  const [subjectRequests, setSubjectRequests] = React.useState<
    SubjectRequestSummary[]
  >([])
  const [subjectRequestsLoading, setSubjectRequestsLoading] =
    React.useState(false)
  const [subjectRequestsFilters, setSubjectRequestsFilters] =
    React.useState<StatsFilters>({
      search: '',
      sortBy: defaultSubjectRequestsSortBy,
      sortDir: defaultSubjectRequestsSortDir
    })
  const [subjectRequestsHasNext, setSubjectRequestsHasNext] =
    React.useState(false)
  const [subjectRequestsTotal, setSubjectRequestsTotal] = React.useState(0)

  const [tutors, setTutors] = React.useState<LessonCountRow[]>([])
  const [tutorsLoading, setTutorsLoading] = React.useState(false)
  const [tutorsFilters, setTutorsFilters] = React.useState<StatsFilters>({
    search: '',
    sortBy: defaultLessonsSortBy,
    sortDir: defaultSortDir
  })
  const [tutorsHasNext, setTutorsHasNext] = React.useState(false)
  const [tutorsTotal, setTutorsTotal] = React.useState(0)
  const [isDownloadingTutorsCsv, setIsDownloadingTutorsCsv] =
    React.useState(false)

  const [students, setStudents] = React.useState<LessonCountRow[]>([])
  const [studentsLoading, setStudentsLoading] = React.useState(false)
  const [studentsFilters, setStudentsFilters] = React.useState<StatsFilters>({
    search: '',
    sortBy: defaultLessonsSortBy,
    sortDir: defaultSortDir
  })
  const [studentsHasNext, setStudentsHasNext] = React.useState(false)
  const [studentsTotal, setStudentsTotal] = React.useState(0)
  const [isDownloadingStudentsCsv, setIsDownloadingStudentsCsv] =
    React.useState(false)
  const [feedbackSummary, setFeedbackSummary] = React.useState<FeedbackSummary>({
    total: 0,
    studentAuthored: 0,
    tutorAuthored: 0,
    averageRating: 0,
    rating1: 0,
    rating2: 0,
    rating3: 0,
    rating4: 0,
    rating5: 0,
    studentToTutorTotal: 0,
    studentToTutorAverageRating: 0,
    studentToTutorRating1: 0,
    studentToTutorRating2: 0,
    studentToTutorRating3: 0,
    studentToTutorRating4: 0,
    studentToTutorRating5: 0,
    tutorToStudentTotal: 0,
    tutorToStudentAverageRating: 0,
    tutorToStudentRating1: 0,
    tutorToStudentRating2: 0,
    tutorToStudentRating3: 0,
    tutorToStudentRating4: 0,
    tutorToStudentRating5: 0
  })
  const [feedbackSummaryLoading, setFeedbackSummaryLoading] =
    React.useState(true)
  const [isDownloadingFeedbackCsv, setIsDownloadingFeedbackCsv] =
    React.useState(false)

  const subjectsColumns = React.useMemo<ColumnDef<SubjectTutorCount>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Materia',
        cell: ({ row }) => row.original.name
      },
      {
        accessorKey: 'tutorCount',
        header: () => <div className='text-right'>Tutor</div>,
        cell: ({ row }) => (
          <div className='text-right'>{row.original.tutorCount}</div>
        )
      }
    ],
    []
  )

  const subjectRequestsColumns = React.useMemo<
    ColumnDef<SubjectRequestSummary>[]
  >(
    () => [
      {
        accessorKey: 'subjectName',
        header: 'Materia',
        cell: ({ row }) => row.original.subjectName
      },
      {
        accessorKey: 'requestCount',
        header: () => <div className='text-right'>Richieste</div>,
        cell: ({ row }) => (
          <div className='text-right'>{row.original.requestCount}</div>
        )
      }
    ],
    []
  )

  const tutorsColumns = React.useMemo<ColumnDef<LessonCountRow>[]>(
    () => [
      {
        accessorKey: 'lastName',
        header: 'Tutor',
        cell: ({ row }) =>
          `${row.original.lastName} ${row.original.firstName}`
      },
      {
        accessorKey: 'sectionName',
        header: 'Sezione',
        cell: ({ row }) => row.original.sectionName ?? '-'
      },
      {
        accessorKey: 'countedLessons',
        header: () => <div className='text-right'>Lezioni</div>,
        cell: ({ row }) => (
          <div className='text-right'>{row.original.countedLessons}</div>
        )
      }
    ],
    []
  )

  const studentsColumns = React.useMemo<ColumnDef<LessonCountRow>[]>(
    () => [
      {
        accessorKey: 'lastName',
        header: 'Studente',
        cell: ({ row }) =>
          `${row.original.lastName} ${row.original.firstName}`
      },
      {
        accessorKey: 'sectionName',
        header: 'Sezione',
        cell: ({ row }) => row.original.sectionName ?? '-'
      },
      {
        accessorKey: 'countedLessons',
        header: () => <div className='text-right'>Lezioni</div>,
        cell: ({ row }) => (
          <div className='text-right'>{row.original.countedLessons}</div>
        )
      }
    ],
    []
  )

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

  const parseSortParam = React.useCallback((value: string | null) => {
    if (!value) {
      return null
    }
    const [sortBy, direction] = value.split(':')
    if (!sortBy) {
      return null
    }
    const sortDir: 'asc' | 'desc' = direction === 'desc' ? 'desc' : 'asc'
    return { sortBy, sortDir }
  }, [])

  const buildFilters = React.useCallback(
    (searchKey: string, sortKey: string, pageKey: string, defaults: StatsFilters) => {
      const sortParam = parseSortParam(searchParams.get(sortKey))
      return {
        search: searchParams.get(searchKey) ?? '',
        sortBy: sortParam?.sortBy ?? defaults.sortBy,
        sortDir: sortParam?.sortDir ?? defaults.sortDir,
        page: parsePage(pageKey)
      }
    },
    [parsePage, parseSortParam, searchParams]
  )

  const currentSubjectsFilters = React.useMemo(
    () =>
      buildFilters('subjectsSearch', 'subjectsSort', 'subjectsPage', {
        search: '',
        sortBy: defaultSubjectsSortBy,
        sortDir: defaultSortDir
      }),
    [buildFilters, defaultSubjectsSortBy, defaultSortDir]
  )

  const currentSubjectRequestsFilters = React.useMemo(
    () =>
      buildFilters(
        'subjectRequestsSearch',
        'subjectRequestsSort',
        'subjectRequestsPage',
        {
          search: '',
          sortBy: defaultSubjectRequestsSortBy,
          sortDir: defaultSubjectRequestsSortDir
        }
      ),
    [
      buildFilters,
      defaultSubjectRequestsSortBy,
      defaultSubjectRequestsSortDir
    ]
  )

  const currentTutorsFilters = React.useMemo(
    () =>
      buildFilters('tutorsSearch', 'tutorsSort', 'tutorsPage', {
        search: '',
        sortBy: defaultLessonsSortBy,
        sortDir: defaultSortDir
      }),
    [buildFilters, defaultLessonsSortBy, defaultSortDir]
  )

  const currentStudentsFilters = React.useMemo(
    () =>
      buildFilters('studentsSearch', 'studentsSort', 'studentsPage', {
        search: '',
        sortBy: defaultLessonsSortBy,
        sortDir: defaultSortDir
      }),
    [buildFilters, defaultLessonsSortBy, defaultSortDir]
  )

  React.useEffect(() => {
    setSubjectsFilters((prev) => {
      const next = {
        search: currentSubjectsFilters.search,
        sortBy: currentSubjectsFilters.sortBy,
        sortDir: currentSubjectsFilters.sortDir
      }
      return prev.search === next.search &&
        prev.sortBy === next.sortBy &&
        prev.sortDir === next.sortDir
        ? prev
        : next
    })
  }, [
    currentSubjectsFilters.search,
    currentSubjectsFilters.sortBy,
    currentSubjectsFilters.sortDir
  ])

  React.useEffect(() => {
    setSubjectRequestsFilters((prev) => {
      const next = {
        search: currentSubjectRequestsFilters.search,
        sortBy: currentSubjectRequestsFilters.sortBy,
        sortDir: currentSubjectRequestsFilters.sortDir
      }
      return prev.search === next.search &&
        prev.sortBy === next.sortBy &&
        prev.sortDir === next.sortDir
        ? prev
        : next
    })
  }, [
    currentSubjectRequestsFilters.search,
    currentSubjectRequestsFilters.sortBy,
    currentSubjectRequestsFilters.sortDir
  ])

  React.useEffect(() => {
    setTutorsFilters((prev) => {
      const next = {
        search: currentTutorsFilters.search,
        sortBy: currentTutorsFilters.sortBy,
        sortDir: currentTutorsFilters.sortDir
      }
      return prev.search === next.search &&
        prev.sortBy === next.sortBy &&
        prev.sortDir === next.sortDir
        ? prev
        : next
    })
  }, [
    currentTutorsFilters.search,
    currentTutorsFilters.sortBy,
    currentTutorsFilters.sortDir
  ])

  React.useEffect(() => {
    setStudentsFilters((prev) => {
      const next = {
        search: currentStudentsFilters.search,
        sortBy: currentStudentsFilters.sortBy,
        sortDir: currentStudentsFilters.sortDir
      }
      return prev.search === next.search &&
        prev.sortBy === next.sortBy &&
        prev.sortDir === next.sortDir
        ? prev
        : next
    })
  }, [
    currentStudentsFilters.search,
    currentStudentsFilters.sortBy,
    currentStudentsFilters.sortDir
  ])

  const updateParams = React.useCallback(
    (
      keys: { searchKey: string; sortKey: string; pageKey: string },
      filters: StatsFilters,
      page: number
    ) => {
      const params = new URLSearchParams(searchParamsString)
      if (filters.search) {
        params.set(keys.searchKey, filters.search)
      } else {
        params.delete(keys.searchKey)
      }
      if (filters.sortBy) {
        params.set(keys.sortKey, `${filters.sortBy}:${filters.sortDir}`)
      } else {
        params.delete(keys.sortKey)
      }
      if (page > 1) {
        params.set(keys.pageKey, String(page))
      } else {
        params.delete(keys.pageKey)
      }

      const nextParams = params.toString()
      const url = nextParams ? `${pathname}?${nextParams}` : pathname
      router.replace(url, { scroll: false })
    },
    [pathname, router, searchParamsString]
  )

  const resetSubjectsFilters = React.useCallback(() => {
    const reset = {
      search: '',
      sortBy: defaultSubjectsSortBy,
      sortDir: defaultSortDir
    }
    setSubjectsFilters(reset)
    updateParams(
      {
        searchKey: 'subjectsSearch',
        sortKey: 'subjectsSort',
        pageKey: 'subjectsPage'
      },
      reset,
      1
    )
  }, [defaultSortDir, defaultSubjectsSortBy, updateParams])

  const resetSubjectRequestsFilters = React.useCallback(() => {
    const reset = {
      search: '',
      sortBy: defaultSubjectRequestsSortBy,
      sortDir: defaultSubjectRequestsSortDir
    }
    setSubjectRequestsFilters(reset)
    updateParams(
      {
        searchKey: 'subjectRequestsSearch',
        sortKey: 'subjectRequestsSort',
        pageKey: 'subjectRequestsPage'
      },
      reset,
      1
    )
  }, [
    defaultSubjectRequestsSortBy,
    defaultSubjectRequestsSortDir,
    updateParams
  ])

  const resetTutorsFilters = React.useCallback(() => {
    const reset = {
      search: '',
      sortBy: defaultLessonsSortBy,
      sortDir: defaultSortDir
    }
    setTutorsFilters(reset)
    updateParams(
      { searchKey: 'tutorsSearch', sortKey: 'tutorsSort', pageKey: 'tutorsPage' },
      reset,
      1
    )
  }, [defaultLessonsSortBy, defaultSortDir, updateParams])

  const resetStudentsFilters = React.useCallback(() => {
    const reset = {
      search: '',
      sortBy: defaultLessonsSortBy,
      sortDir: defaultSortDir
    }
    setStudentsFilters(reset)
    updateParams(
      {
        searchKey: 'studentsSearch',
        sortKey: 'studentsSort',
        pageKey: 'studentsPage'
      },
      reset,
      1
    )
  }, [defaultLessonsSortBy, defaultSortDir, updateParams])

  const handleTabChange = React.useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParamsString)
      if (value === 'overview') {
        params.delete('tab')
      } else {
        params.set('tab', value)
      }
      const nextParams = params.toString()
      const url = nextParams ? `${pathname}?${nextParams}` : pathname
      router.replace(url, { scroll: false })
    },
    [pathname, router, searchParamsString]
  )

  const fetchAllUsersByRole = React.useCallback(async (role: 'student' | 'tutor') => {
    const allUsers: UserExportRow[] = []
    let offset = 0
    const exportPageSize = 200

    while (true) {
      const params = new URLSearchParams({
        role,
        sortBy: 'lastName',
        sortDir: 'asc',
        limit: String(exportPageSize),
        offset: String(offset)
      })

      const response = await fetch(`/api/users?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Impossibile scaricare gli utenti.')
      }

      const payload = await response.json()
      const { items, total } = normalizePaged<UserExportRow>(payload)
      allUsers.push(...items)
      offset += items.length

      if (items.length === 0 || allUsers.length >= total) {
        break
      }
    }

    return allUsers
  }, [])

  const exportUsersCsv = React.useCallback(async (role: 'student' | 'tutor') => {
    const setLoading =
      role === 'student'
        ? setIsDownloadingStudentsCsv
        : setIsDownloadingTutorsCsv

    setLoading(true)

    try {
      const allUsers: UserExportRow[] = []
      const allStats: Array<StudentExportStatsRow | TutorExportStatsRow> = []
      let offset = 0
      const exportPageSize = 200

      while (true) {
        const userParams = new URLSearchParams({
          role,
          sortBy: 'lastName',
          sortDir: 'asc',
          limit: String(exportPageSize),
          offset: String(offset)
        })

        const statsParams = new URLSearchParams({
          sortBy: 'lastName',
          sortDir: 'asc',
          limit: String(exportPageSize),
          offset: String(offset)
        })

        const [usersResponse, statsResponse] = await Promise.all([
          fetch(`/api/users?${userParams.toString()}`),
          fetch(
            role === 'student'
              ? `/api/admin/stats/lessons-counts/students?${statsParams.toString()}`
              : `/api/admin/stats/lessons-counts/tutors?${statsParams.toString()}`
          )
        ])

        if (!usersResponse.ok || !statsResponse.ok) {
          throw new Error('Impossibile scaricare gli utenti.')
        }

        const usersPayload = await usersResponse.json()
        const statsPayload = await statsResponse.json()
        const { items, total } = normalizePaged<UserExportRow>(usersPayload)
        const { items: statsItems } = normalizePaged<
          StudentExportStatsRow | TutorExportStatsRow
        >(statsPayload)

        allUsers.push(...items)
        allStats.push(...statsItems)
        offset += items.length
        if (items.length === 0 || allUsers.length >= total) {
          break
        }
      }

      const csv = role === 'student'
        ? buildStudentsCsv(
            allUsers.map((user) => {
              const stats = allStats.find(
                (row): row is StudentExportStatsRow =>
                  'studentId' in row && row.studentId === user.id
              )

              return {
                ...user,
                lessonsPresentCounted: stats?.lessonsPresentCounted ?? 0,
                lessonsPresentNotCounted: stats?.lessonsPresentNotCounted ?? 0,
                lessonsAbsentCounted: stats?.lessonsAbsentCounted ?? 0,
                lessonsAbsentNotCounted: stats?.lessonsAbsentNotCounted ?? 0,
                lessonsWithoutPresenceCounted: stats?.lessonsWithoutPresenceCounted ?? 0,
                lessonsWithoutPresenceNotCounted: stats?.lessonsWithoutPresenceNotCounted ?? 0
              }
            })
          )
        : buildTutorsCsv(
            allUsers.map((user) => {
              const stats = allStats.find(
                (row): row is TutorExportStatsRow =>
                  'tutorId' in row && row.tutorId === user.id
              )

              return {
                ...user,
                lessonsScheduledCounted: stats?.lessonsScheduledCounted ?? 0,
                lessonsScheduledNotCounted: stats?.lessonsScheduledNotCounted ?? 0,
                lessonsConfirmedCounted: stats?.lessonsConfirmedCounted ?? 0,
                lessonsConfirmedNotCounted: stats?.lessonsConfirmedNotCounted ?? 0,
                lessonsCancelledCounted: stats?.lessonsCancelledCounted ?? 0,
                lessonsCancelledNotCounted: stats?.lessonsCancelledNotCounted ?? 0,
                lessonsCompletedCounted: stats?.lessonsCompletedCounted ?? 0,
                lessonsCompletedNotCounted: stats?.lessonsCompletedNotCounted ?? 0
              }
            })
          )
      downloadCsv(buildExportFilename(role), csv)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile scaricare gli utenti.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  const exportFeedbackCsv = React.useCallback(async (role: 'student' | 'tutor') => {
    setIsDownloadingFeedbackCsv(true)

    try {
      const [studentsList, tutorsList] = await Promise.all([
        fetchAllUsersByRole('student'),
        fetchAllUsersByRole('tutor')
      ])

      const userMap = new Map(
        [...studentsList, ...tutorsList]
          .filter((user): user is UserExportRow & { id: string } => Boolean(user.id))
          .map((user) => [user.id, user])
      )

      const feedback: FeedbackExportRow[] = []
      let offset = 0
      const exportPageSize = 200

      while (true) {
        const params = new URLSearchParams({
          sortBy: 'createdAt',
          sortDir: 'desc',
          limit: String(exportPageSize),
          offset: String(offset)
        })

        const response = await fetch(`/api/feedback?${params.toString()}`)
        if (!response.ok) {
          throw new Error('Impossibile scaricare i feedback.')
        }

        const payload = await response.json()
        const { items, total } = normalizePaged<FeedbackExportRow>(payload)
        feedback.push(...items)
        offset += items.length

        if (items.length === 0 || feedback.length >= total) {
          break
        }
      }

      const csv = buildFeedbackCsv(
        feedback
          .filter((item) => item.authorRole === role)
          .map((item) => {
          const author = userMap.get(item.authorUserId)
          const target = userMap.get(item.targetUserId)
          const authorName =
            `${author?.lastName ?? ''} ${author?.firstName ?? ''}`.trim() || item.authorUserId
          const targetName =
            `${target?.lastName ?? ''} ${target?.firstName ?? ''}`.trim() || item.targetUserId

          return {
            id: item.id,
            lessonId: item.lessonId,
            bookingId: item.bookingId,
            authorRole: item.authorRole,
            authorName,
            authorEmail: author?.email ?? '',
            targetName,
            targetEmail: target?.email ?? '',
            rating: item.rating,
            text: item.text,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          }
        })
      )

      downloadCsv(buildFeedbackExportFilename(role), csv)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile scaricare i feedback.'
      )
    } finally {
      setIsDownloadingFeedbackCsv(false)
    }
  }, [fetchAllUsersByRole])

  React.useEffect(() => {
    let isMounted = true
    async function loadTotals() {
      setTotalsLoading(true)
      try {
        const [
          lessonsResponse,
          bookingsResponse,
          studentStatusResponse,
          tutorStatusResponse
        ] = await Promise.all([
          fetch('/api/admin/stats/lessons-confirmed/count'),
          fetch('/api/admin/stats/bookings-confirmed/count'),
          fetch('/api/admin/stats/students/status-counts'),
          fetch('/api/admin/stats/tutors/status-counts')
        ])

        if (!lessonsResponse.ok || !bookingsResponse.ok) {
          throw new Error('Impossibile caricare i conteggi delle lezioni.')
        }
        if (!studentStatusResponse.ok || !tutorStatusResponse.ok) {
          throw new Error('Impossibile caricare i conteggi utenti.')
        }

        const lessonsPayload = (await lessonsResponse.json()) as {
          total?: number
        }
        const bookingsPayload = (await bookingsResponse.json()) as {
          total?: number
        }
        const studentStatusPayload = (await studentStatusResponse.json()) as {
          active?: number
          inactive?: number
          pendingEmailVerification?: number
        }
        const tutorStatusPayload = (await tutorStatusResponse.json()) as {
          active?: number
          inactive?: number
          invites?: number
        }

        if (isMounted) {
          setTotals({
            lessonsConfirmed: lessonsPayload.total ?? 0,
            bookingsConfirmed: bookingsPayload.total ?? 0,
            studentsActive: studentStatusPayload.active ?? 0,
            studentsInactive: studentStatusPayload.inactive ?? 0,
            studentsPending: studentStatusPayload.pendingEmailVerification ?? 0,
            tutorsActive: tutorStatusPayload.active ?? 0,
            tutorsInactive: tutorStatusPayload.inactive ?? 0,
            tutorsInvites: tutorStatusPayload.invites ?? 0
          })
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le statistiche.'
        )
      } finally {
        if (isMounted) {
          setTotalsLoading(false)
        }
      }
    }

    void loadTotals()
    return () => {
      isMounted = false
    }
  }, [])

  React.useEffect(() => {
    let isMounted = true

    async function loadFeedbackSummary() {
      setFeedbackSummaryLoading(true)
      try {
        const response = await fetch('/api/admin/stats/feedback/summary')
        if (!response.ok) {
          throw new Error('Impossibile caricare le statistiche feedback.')
        }

        const payload = (await response.json()) as Partial<FeedbackSummary>
        if (isMounted) {
          setFeedbackSummary({
            total: payload.total ?? 0,
            studentAuthored: payload.studentAuthored ?? 0,
            tutorAuthored: payload.tutorAuthored ?? 0,
            averageRating: payload.averageRating ?? 0,
            rating1: payload.rating1 ?? 0,
            rating2: payload.rating2 ?? 0,
            rating3: payload.rating3 ?? 0,
            rating4: payload.rating4 ?? 0,
            rating5: payload.rating5 ?? 0,
            studentToTutorTotal: payload.studentToTutorTotal ?? 0,
            studentToTutorAverageRating: payload.studentToTutorAverageRating ?? 0,
            studentToTutorRating1: payload.studentToTutorRating1 ?? 0,
            studentToTutorRating2: payload.studentToTutorRating2 ?? 0,
            studentToTutorRating3: payload.studentToTutorRating3 ?? 0,
            studentToTutorRating4: payload.studentToTutorRating4 ?? 0,
            studentToTutorRating5: payload.studentToTutorRating5 ?? 0,
            tutorToStudentTotal: payload.tutorToStudentTotal ?? 0,
            tutorToStudentAverageRating: payload.tutorToStudentAverageRating ?? 0,
            tutorToStudentRating1: payload.tutorToStudentRating1 ?? 0,
            tutorToStudentRating2: payload.tutorToStudentRating2 ?? 0,
            tutorToStudentRating3: payload.tutorToStudentRating3 ?? 0,
            tutorToStudentRating4: payload.tutorToStudentRating4 ?? 0,
            tutorToStudentRating5: payload.tutorToStudentRating5 ?? 0
          })
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le statistiche feedback.'
        )
      } finally {
        if (isMounted) {
          setFeedbackSummaryLoading(false)
        }
      }
    }

    void loadFeedbackSummary()
    return () => {
      isMounted = false
    }
  }, [])

  React.useEffect(() => {
    let isMounted = true
    async function loadSubjects() {
      setSubjectsLoading(true)
      try {
        const params = new URLSearchParams()
        if (currentSubjectsFilters.search.trim()) {
          params.set('q', currentSubjectsFilters.search.trim())
        }
        params.set('sortBy', currentSubjectsFilters.sortBy)
        params.set('sortDir', currentSubjectsFilters.sortDir)
        params.set('limit', String(pageSize))
        params.set(
          'offset',
          String((currentSubjectsFilters.page - 1) * pageSize)
        )
        const response = await fetch(
          `/api/admin/stats/subjects-tutor-counts?${params.toString()}`
        )
        if (!response.ok) {
          throw new Error('Impossibile caricare le statistiche materie.')
        }
        const payload = await response.json()
        const { items, total } = normalizePaged<SubjectTutorCount>(payload)
        if (isMounted) {
          setSubjects(items)
          setSubjectsTotal(total)
          setSubjectsHasNext(items.length === pageSize)
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le statistiche materie.'
        )
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
  }, [
    currentSubjectsFilters.page,
    currentSubjectsFilters.search,
    currentSubjectsFilters.sortBy,
    currentSubjectsFilters.sortDir
  ])

  React.useEffect(() => {
    let isMounted = true
    async function loadSubjectRequests() {
      setSubjectRequestsLoading(true)
      try {
        const params = new URLSearchParams()
        if (currentSubjectRequestsFilters.search.trim()) {
          params.set('q', currentSubjectRequestsFilters.search.trim())
        }
        params.set('mode', 'summary')
        params.set('sortBy', currentSubjectRequestsFilters.sortBy)
        params.set('sortDir', currentSubjectRequestsFilters.sortDir)
        params.set('limit', String(pageSize))
        params.set(
          'offset',
          String((currentSubjectRequestsFilters.page - 1) * pageSize)
        )
        const response = await fetch(
          `/api/subject-requests?${params.toString()}`
        )
        if (!response.ok) {
          throw new Error('Impossibile caricare le richieste materia.')
        }
        const payload = await response.json()
        const { items, total } =
          normalizePaged<SubjectRequestSummary>(payload)
        if (isMounted) {
          setSubjectRequests(items)
          setSubjectRequestsTotal(total)
          setSubjectRequestsHasNext(items.length === pageSize)
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le richieste materia.'
        )
      } finally {
        if (isMounted) {
          setSubjectRequestsLoading(false)
        }
      }
    }

    void loadSubjectRequests()
    return () => {
      isMounted = false
    }
  }, [
    currentSubjectRequestsFilters.page,
    currentSubjectRequestsFilters.search,
    currentSubjectRequestsFilters.sortBy,
    currentSubjectRequestsFilters.sortDir
  ])

  React.useEffect(() => {
    let isMounted = true
    async function loadTutors() {
      setTutorsLoading(true)
      try {
        const params = new URLSearchParams()
        if (currentTutorsFilters.search.trim()) {
          params.set('q', currentTutorsFilters.search.trim())
        }
        params.set('sortBy', currentTutorsFilters.sortBy)
        params.set('sortDir', currentTutorsFilters.sortDir)
        params.set('limit', String(pageSize))
        params.set(
          'offset',
          String((currentTutorsFilters.page - 1) * pageSize)
        )
        const response = await fetch(
          `/api/admin/stats/lessons-counts/tutors?${params.toString()}`
        )
        if (!response.ok) {
          throw new Error('Impossibile caricare le statistiche tutor.')
        }
        const payload = await response.json()
        const { items, total } = normalizePaged<LessonCountRow>(payload)
        if (isMounted) {
          setTutors(items)
          setTutorsTotal(total)
          setTutorsHasNext(items.length === pageSize)
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le statistiche tutor.'
        )
      } finally {
        if (isMounted) {
          setTutorsLoading(false)
        }
      }
    }

    void loadTutors()
    return () => {
      isMounted = false
    }
  }, [
    currentTutorsFilters.page,
    currentTutorsFilters.search,
    currentTutorsFilters.sortBy,
    currentTutorsFilters.sortDir
  ])

  React.useEffect(() => {
    let isMounted = true
    async function loadStudents() {
      setStudentsLoading(true)
      try {
        const params = new URLSearchParams()
        if (currentStudentsFilters.search.trim()) {
          params.set('q', currentStudentsFilters.search.trim())
        }
        params.set('sortBy', currentStudentsFilters.sortBy)
        params.set('sortDir', currentStudentsFilters.sortDir)
        params.set('limit', String(pageSize))
        params.set(
          'offset',
          String((currentStudentsFilters.page - 1) * pageSize)
        )
        const response = await fetch(
          `/api/admin/stats/lessons-counts/students?${params.toString()}`
        )
        if (!response.ok) {
          throw new Error('Impossibile caricare le statistiche studenti.')
        }
        const payload = await response.json()
        const { items, total } = normalizePaged<LessonCountRow>(payload)
        if (isMounted) {
          setStudents(items)
          setStudentsTotal(total)
          setStudentsHasNext(items.length === pageSize)
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le statistiche studenti.'
        )
      } finally {
        if (isMounted) {
          setStudentsLoading(false)
        }
      }
    }

    void loadStudents()
    return () => {
      isMounted = false
    }
  }, [
    currentStudentsFilters.page,
    currentStudentsFilters.search,
    currentStudentsFilters.sortBy,
    currentStudentsFilters.sortDir
  ])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl space-y-6'>
          <div className='mb-6 self-start'>
            <BackButton />
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Statistiche</h1>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <div className='sm:hidden'>
              <Select value={activeTab} onValueChange={handleTabChange}>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Seleziona sezione' />
                </SelectTrigger>
                <SelectContent>
                  {availableTabs.map((tab) => (
                    <SelectItem key={tab} value={tab}>
                      {tabLabels[tab]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TabsList className='hidden sm:grid w-full grid-cols-6'>
              <TabsTrigger value='overview' className='w-full'>
                Panoramica
              </TabsTrigger>
              <TabsTrigger value='subjects' className='w-full'>
                Materie
              </TabsTrigger>
              <TabsTrigger value='subject-requests' className='w-full'>
                Richieste materie
              </TabsTrigger>
              <TabsTrigger value='tutors' className='w-full'>
                Tutor
              </TabsTrigger>
              <TabsTrigger value='students' className='w-full'>
                Studenti
              </TabsTrigger>
              <TabsTrigger value='feedback' className='w-full'>
                Feedback
              </TabsTrigger>
            </TabsList>

            <TabsContent value='overview' className='mt-6 space-y-6'>
              <PushCoverageCard />
              <div className='grid gap-4 md:grid-cols-2'>
                <Card>
                  <CardHeader>
                    <CardTitle>Lezioni confermate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-3xl font-semibold'>
                      {totalsLoading ? '-' : totals.lessonsConfirmed}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Prenotazioni confermate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-3xl font-semibold'>
                      {totalsLoading ? '-' : totals.bookingsConfirmed}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className='grid gap-4 md:grid-cols-2'>
                <Card>
                  <CardHeader>
                    <div className='flex items-center justify-between gap-3'>
                      <CardTitle>Studenti</CardTitle>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => void exportUsersCsv('student')}
                        disabled={isDownloadingStudentsCsv}
                      >
                        {isDownloadingStudentsCsv
                          ? 'Download...'
                          : 'Download CSV'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm text-muted-foreground'>
                        Attivi
                      </span>
                      <span className='font-semibold'>
                        {totalsLoading ? '-' : totals.studentsActive}
                      </span>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm text-muted-foreground'>
                        Inattivi
                      </span>
                      <span className='font-semibold'>
                        {totalsLoading ? '-' : totals.studentsInactive}
                      </span>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm text-muted-foreground'>
                        Email da verificare
                      </span>
                      <span className='font-semibold'>
                        {totalsLoading ? '-' : totals.studentsPending}
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <div className='flex items-center justify-between gap-3'>
                      <CardTitle>Tutor</CardTitle>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => void exportUsersCsv('tutor')}
                        disabled={isDownloadingTutorsCsv}
                      >
                        {isDownloadingTutorsCsv
                          ? 'Download...'
                          : 'Download CSV'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm text-muted-foreground'>
                        Attivi
                      </span>
                      <span className='font-semibold'>
                        {totalsLoading ? '-' : totals.tutorsActive}
                      </span>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm text-muted-foreground'>
                        Inattivi
                      </span>
                      <span className='font-semibold'>
                        {totalsLoading ? '-' : totals.tutorsInactive}
                      </span>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-sm text-muted-foreground'>
                        Inviti
                      </span>
                      <span className='font-semibold'>
                        {totalsLoading ? '-' : totals.tutorsInvites}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value='subjects' className='mt-6 space-y-6'>
              <Card>
                <CardHeader>
                  <CardTitle>Conteggio tutor per materia</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <form
                    className='rounded-lg border bg-card p-4 shadow-sm'
                    onSubmit={(event) => {
                      event.preventDefault()
                      updateParams(
                        {
                          searchKey: 'subjectsSearch',
                          sortKey: 'subjectsSort',
                          pageKey: 'subjectsPage'
                        },
                        subjectsFilters,
                        1
                      )
                    }}
                  >
                    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                      <Field className='gap-2 lg:col-span-2'>
                        <FieldLabel htmlFor='subjects-search'>Cerca</FieldLabel>
                        <div className='relative'>
                          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <Input
                            id='subjects-search'
                            type='search'
                            placeholder='Nome materia'
                            value={subjectsFilters.search}
                            onChange={(event) =>
                              setSubjectsFilters((prev) => ({
                                ...prev,
                                search: event.target.value
                              }))
                            }
                            className='pl-9'
                          />
                        </div>
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Ordina per</FieldLabel>
                        <Select
                          value={subjectsFilters.sortBy}
                          onValueChange={(value) =>
                            setSubjectsFilters((prev) => ({
                              ...prev,
                              sortBy: value
                            }))
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Ordinamento' />
                          </SelectTrigger>
                          <SelectContent>
                            {subjectsSortOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Direzione</FieldLabel>
                        <Select
                          value={subjectsFilters.sortDir}
                          onValueChange={(value) =>
                            setSubjectsFilters((prev) => ({
                              ...prev,
                              sortDir: value === 'desc' ? 'desc' : 'asc'
                            }))
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Direzione' />
                          </SelectTrigger>
                          <SelectContent>
                            {sortDirOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className='mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
                      <div />
                      <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
                        <Button
                          variant='outline'
                          type='button'
                          onClick={resetSubjectsFilters}
                        >
                          Reset filtri
                        </Button>
                        <Button type='submit'>
                          Applica filtri
                        </Button>
                      </div>
                    </div>
                  </form>

                  <DataTable
                    data={subjects}
                    columns={subjectsColumns}
                    isLoading={subjectsLoading}
                    emptyMessage='Nessun risultato trovato.'
                    pageKey='subjectsPage'
                    page={currentSubjectsFilters.page}
                    pageSize={pageSize}
                    total={subjectsTotal}
                    hasNext={subjectsHasNext}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='subject-requests' className='mt-6 space-y-6'>
              <Card>
                <CardHeader>
                  <CardTitle>Richieste materie</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <form
                    className='rounded-lg border bg-card p-4 shadow-sm'
                    onSubmit={(event) => {
                      event.preventDefault()
                      updateParams(
                        {
                          searchKey: 'subjectRequestsSearch',
                          sortKey: 'subjectRequestsSort',
                          pageKey: 'subjectRequestsPage'
                        },
                        subjectRequestsFilters,
                        1
                      )
                    }}
                  >
                    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                      <Field className='gap-2 lg:col-span-2'>
                        <FieldLabel htmlFor='subject-requests-search'>
                          Cerca
                        </FieldLabel>
                        <div className='relative'>
                          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <Input
                            id='subject-requests-search'
                            type='search'
                            placeholder='Nome materia'
                            value={subjectRequestsFilters.search}
                            onChange={(event) =>
                              setSubjectRequestsFilters((prev) => ({
                                ...prev,
                                search: event.target.value
                              }))
                            }
                            className='pl-9'
                          />
                        </div>
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Ordina per</FieldLabel>
                        <Select
                          value={subjectRequestsFilters.sortBy}
                          onValueChange={(value) =>
                            setSubjectRequestsFilters((prev) => ({
                              ...prev,
                              sortBy: value
                            }))
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Ordinamento' />
                          </SelectTrigger>
                          <SelectContent>
                            {subjectRequestsSortOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Direzione</FieldLabel>
                        <Select
                          value={subjectRequestsFilters.sortDir}
                          onValueChange={(value) =>
                            setSubjectRequestsFilters((prev) => ({
                              ...prev,
                              sortDir: value === 'desc' ? 'desc' : 'asc'
                            }))
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Direzione' />
                          </SelectTrigger>
                          <SelectContent>
                            {sortDirOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className='mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
                      <div />
                      <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
                        <Button
                          variant='outline'
                          type='button'
                          onClick={resetSubjectRequestsFilters}
                        >
                          Reset filtri
                        </Button>
                        <Button type='submit'>Applica filtri</Button>
                      </div>
                    </div>
                  </form>

                  <DataTable
                    data={subjectRequests}
                    columns={subjectRequestsColumns}
                    isLoading={subjectRequestsLoading}
                    emptyMessage='Nessuna richiesta trovata.'
                    pageKey='subjectRequestsPage'
                    page={currentSubjectRequestsFilters.page}
                    pageSize={pageSize}
                    total={subjectRequestsTotal}
                    hasNext={subjectRequestsHasNext}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='tutors' className='mt-6 space-y-6'>
              <Card>
                <CardHeader>
                  <CardTitle>Lezioni conteggiate per tutor</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <form
                    className='rounded-lg border bg-card p-4 shadow-sm'
                    onSubmit={(event) => {
                      event.preventDefault()
                      updateParams(
                        {
                          searchKey: 'tutorsSearch',
                          sortKey: 'tutorsSort',
                          pageKey: 'tutorsPage'
                        },
                        tutorsFilters,
                        1
                      )
                    }}
                  >
                    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                      <Field className='gap-2 lg:col-span-2'>
                        <FieldLabel htmlFor='tutors-search'>Cerca</FieldLabel>
                        <div className='relative'>
                          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <Input
                            id='tutors-search'
                            type='search'
                            placeholder='Nome o cognome'
                            value={tutorsFilters.search}
                            onChange={(event) =>
                              setTutorsFilters((prev) => ({
                                ...prev,
                                search: event.target.value
                              }))
                            }
                            className='pl-9'
                          />
                        </div>
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Ordina per</FieldLabel>
                        <Select
                          value={tutorsFilters.sortBy}
                          onValueChange={(value) =>
                            setTutorsFilters((prev) => ({
                              ...prev,
                              sortBy: value
                            }))
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Ordinamento' />
                          </SelectTrigger>
                          <SelectContent>
                            {lessonsSortOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Direzione</FieldLabel>
                        <Select
                          value={tutorsFilters.sortDir}
                          onValueChange={(value) =>
                            setTutorsFilters((prev) => ({
                              ...prev,
                              sortDir: value === 'desc' ? 'desc' : 'asc'
                            }))
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Direzione' />
                          </SelectTrigger>
                          <SelectContent>
                            {sortDirOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className='mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
                      <div />
                      <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
                        <Button
                          variant='outline'
                          type='button'
                          onClick={resetTutorsFilters}
                        >
                          Reset filtri
                        </Button>
                        <Button type='submit'>
                          Applica filtri
                        </Button>
                      </div>
                    </div>
                  </form>

                  <DataTable
                    data={tutors}
                    columns={tutorsColumns}
                    isLoading={tutorsLoading}
                    emptyMessage='Nessun risultato trovato.'
                    pageKey='tutorsPage'
                    page={currentTutorsFilters.page}
                    pageSize={pageSize}
                    total={tutorsTotal}
                    hasNext={tutorsHasNext}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='students' className='mt-6 space-y-6'>
              <Card>
                <CardHeader>
                  <CardTitle>Lezioni conteggiate per studente</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <form
                    className='rounded-lg border bg-card p-4 shadow-sm'
                    onSubmit={(event) => {
                      event.preventDefault()
                      updateParams(
                        {
                          searchKey: 'studentsSearch',
                          sortKey: 'studentsSort',
                          pageKey: 'studentsPage'
                        },
                        studentsFilters,
                        1
                      )
                    }}
                  >
                    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                      <Field className='gap-2 lg:col-span-2'>
                        <FieldLabel htmlFor='students-search'>Cerca</FieldLabel>
                        <div className='relative'>
                          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <Input
                            id='students-search'
                            type='search'
                            placeholder='Nome o cognome'
                            value={studentsFilters.search}
                            onChange={(event) =>
                              setStudentsFilters((prev) => ({
                                ...prev,
                                search: event.target.value
                              }))
                            }
                            className='pl-9'
                          />
                        </div>
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Ordina per</FieldLabel>
                        <Select
                          value={studentsFilters.sortBy}
                          onValueChange={(value) =>
                            setStudentsFilters((prev) => ({
                              ...prev,
                              sortBy: value
                            }))
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Ordinamento' />
                          </SelectTrigger>
                          <SelectContent>
                            {lessonsSortOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Direzione</FieldLabel>
                        <Select
                          value={studentsFilters.sortDir}
                          onValueChange={(value) =>
                            setStudentsFilters((prev) => ({
                              ...prev,
                              sortDir: value === 'desc' ? 'desc' : 'asc'
                            }))
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Direzione' />
                          </SelectTrigger>
                          <SelectContent>
                            {sortDirOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className='mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
                      <div />
                      <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
                        <Button
                          variant='outline'
                          type='button'
                          onClick={resetStudentsFilters}
                        >
                          Reset filtri
                        </Button>
                        <Button type='submit'>
                          Applica filtri
                        </Button>
                      </div>
                    </div>
                  </form>

                  <DataTable
                    data={students}
                    columns={studentsColumns}
                    isLoading={studentsLoading}
                    emptyMessage='Nessun risultato trovato.'
                    pageKey='studentsPage'
                    page={currentStudentsFilters.page}
                    pageSize={pageSize}
                    total={studentsTotal}
                    hasNext={studentsHasNext}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='feedback' className='mt-6 space-y-6'>
              <Card>
                <CardHeader>
                  <div className='flex items-center justify-between gap-3'>
                    <CardTitle>Statistiche feedback</CardTitle>
                    <div className='flex flex-col gap-2 sm:flex-row'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => void exportFeedbackCsv('student')}
                        disabled={isDownloadingFeedbackCsv}
                      >
                        {isDownloadingFeedbackCsv
                          ? 'Download...'
                          : 'Download CSV studenti'}
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => void exportFeedbackCsv('tutor')}
                        disabled={isDownloadingFeedbackCsv}
                      >
                        {isDownloadingFeedbackCsv
                          ? 'Download...'
                          : 'Download CSV tutor'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='space-y-6'>
                  <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
                    <Card>
                      <CardHeader>
                        <CardTitle>Feedback totali</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className='text-3xl font-semibold'>
                          {feedbackSummaryLoading ? '-' : feedbackSummary.total}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Media valutazioni</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className='text-3xl font-semibold'>
                          {feedbackSummaryLoading
                            ? '-'
                            : feedbackSummary.averageRating.toFixed(2)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Studenti verso tutor</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className='text-3xl font-semibold'>
                          {feedbackSummaryLoading
                            ? '-'
                            : feedbackSummary.studentToTutorTotal}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Tutor verso studenti</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className='text-3xl font-semibold'>
                          {feedbackSummaryLoading
                            ? '-'
                            : feedbackSummary.tutorToStudentTotal}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className='space-y-4'>
                    <h3 className='text-base font-medium'>Studente verso tutor</h3>
                    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-6'>
                      <Card>
                        <CardHeader>
                          <CardTitle>Media</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className='text-2xl font-semibold'>
                            {feedbackSummaryLoading
                              ? '-'
                              : feedbackSummary.studentToTutorAverageRating.toFixed(2)}
                          </div>
                        </CardContent>
                      </Card>
                      <Card><CardHeader><CardTitle>1 stella</CardTitle></CardHeader><CardContent><div className='text-2xl font-semibold'>{feedbackSummaryLoading ? '-' : feedbackSummary.studentToTutorRating1}</div></CardContent></Card>
                      <Card><CardHeader><CardTitle>2 stelle</CardTitle></CardHeader><CardContent><div className='text-2xl font-semibold'>{feedbackSummaryLoading ? '-' : feedbackSummary.studentToTutorRating2}</div></CardContent></Card>
                      <Card><CardHeader><CardTitle>3 stelle</CardTitle></CardHeader><CardContent><div className='text-2xl font-semibold'>{feedbackSummaryLoading ? '-' : feedbackSummary.studentToTutorRating3}</div></CardContent></Card>
                      <Card><CardHeader><CardTitle>4 stelle</CardTitle></CardHeader><CardContent><div className='text-2xl font-semibold'>{feedbackSummaryLoading ? '-' : feedbackSummary.studentToTutorRating4}</div></CardContent></Card>
                      <Card><CardHeader><CardTitle>5 stelle</CardTitle></CardHeader><CardContent><div className='text-2xl font-semibold'>{feedbackSummaryLoading ? '-' : feedbackSummary.studentToTutorRating5}</div></CardContent></Card>
                    </div>
                  </div>

                  <div className='space-y-4'>
                    <h3 className='text-base font-medium'>Tutor verso studente</h3>
                    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-6'>
                      <Card>
                        <CardHeader>
                          <CardTitle>Media</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className='text-2xl font-semibold'>
                            {feedbackSummaryLoading
                              ? '-'
                              : feedbackSummary.tutorToStudentAverageRating.toFixed(2)}
                          </div>
                        </CardContent>
                      </Card>
                      <Card><CardHeader><CardTitle>1 stella</CardTitle></CardHeader><CardContent><div className='text-2xl font-semibold'>{feedbackSummaryLoading ? '-' : feedbackSummary.tutorToStudentRating1}</div></CardContent></Card>
                      <Card><CardHeader><CardTitle>2 stelle</CardTitle></CardHeader><CardContent><div className='text-2xl font-semibold'>{feedbackSummaryLoading ? '-' : feedbackSummary.tutorToStudentRating2}</div></CardContent></Card>
                      <Card><CardHeader><CardTitle>3 stelle</CardTitle></CardHeader><CardContent><div className='text-2xl font-semibold'>{feedbackSummaryLoading ? '-' : feedbackSummary.tutorToStudentRating3}</div></CardContent></Card>
                      <Card><CardHeader><CardTitle>4 stelle</CardTitle></CardHeader><CardContent><div className='text-2xl font-semibold'>{feedbackSummaryLoading ? '-' : feedbackSummary.tutorToStudentRating4}</div></CardContent></Card>
                      <Card><CardHeader><CardTitle>5 stelle</CardTitle></CardHeader><CardContent><div className='text-2xl font-semibold'>{feedbackSummaryLoading ? '-' : feedbackSummary.tutorToStudentRating5}</div></CardContent></Card>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  )
}
