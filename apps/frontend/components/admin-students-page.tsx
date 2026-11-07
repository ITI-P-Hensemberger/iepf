'use client'

import { nextSort, SortableHead, type SortDir } from '@/components/sortable-head'
import { ListPagination } from '@/components/list-pagination'
import { TableSkeletonRows } from '@/components/loading'
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { toast } from 'sonner'

import { FilterForm } from '@/components/filter-form'
import { PageHeader } from '@/components/page-header'
import { useHere, useSetParam, withFrom } from '@/lib/back-link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { classLabel } from '@/lib/class-label'

const pageSize = 20

const SORTABLE = ['lastName', 'firstName', 'year', 'lessonTokens'] as const

type User = {
  id: string
  email: string
  firstName: string
  lastName: string
  role?: string | null
  sectionId?: string | null
  sectionName?: string | null
  year?: number | null
  lessonTokens?: number | null
  isActive?: boolean | null
}

type DataTableProps<TData> = {
  // Opens the row's details: the whole row is the link.
  rowHref?: (row: TData) => string
  data: TData[]
  columns: ColumnDef<TData>[]
  isLoading: boolean
  emptyMessage: string
  pageKey: string
  page: number
  pageSize: number
  total: number
  // Columns whose header sorts the list, and the sort in use.
  sortable?: readonly string[]
  sort?: { sortBy: string, sortDir: SortDir }
  onSort?: (key: string) => void
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

function DataTable<TData>({
  data,
  rowHref,
  columns,
  isLoading,
  emptyMessage,
  pageKey,
  page,
  pageSize,
  total,
  sortable,
  sort,
  onSort
}: DataTableProps<TData>) {
  const router = useRouter()
  const here = useHere()
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
          <TableHeader sticky className='bg-muted/50'>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.column.id === 'actions' ? 'w-16' : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : sort && onSort && sortable?.includes(header.column.id)
                        ? (
                            <SortableHead
                              label={flexRender(header.column.columnDef.header, header.getContext())}
                              sortKey={header.column.id}
                              sortBy={sort.sortBy}
                              sortDir={sort.sortDir}
                              onSort={onSort}
                            />
                          )
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
              <TableSkeletonRows columns={columns.length} />
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={rowHref ? 'cursor-pointer' : undefined}
                  tabIndex={rowHref ? 0 : undefined}
                  onClick={rowHref
                    ? (event) => {
                        // Buttons and links inside the row keep their own action.
                        if ((event.target as HTMLElement).closest('a, button, input, [role="checkbox"]')) return
                        router.push(withFrom(rowHref(row.original), here))
                      }
                    : undefined}
                  onKeyDown={rowHref
                    ? (event) => {
                        if (event.key === 'Enter' && event.target === event.currentTarget) router.push(withFrom(rowHref(row.original), here))
                      }
                    : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={
                        cell.column.id === 'actions'
                          ? 'w-16 text-right'
                          : undefined
                      }
                    >
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
      <ListPagination page={page} pageSize={pageSize} total={total} onPageChange={(next) => updatePage(next)} loading={isLoading} />
    </div>
  )
}

type StudentFilters = {
  search: string
  sortBy: string
  sortDir: 'asc' | 'desc'
}

const defaultFilters: StudentFilters = {
  search: '',
  sortBy: 'lastName',
  sortDir: 'asc'
}

export default function AdminStudentsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const setParam = useSetParam()
  // The open tab lives in the URL, so it is still open after a trip to a detail page and back.
  const listTab = (['inactive'] as const).find((value) => value === searchParams.get('tab')) ?? 'active'
  const searchParamsString = searchParams.toString()
  const [activeStudents, setActiveStudents] = React.useState<User[]>([])
  const [inactiveStudents, setInactiveStudents] = React.useState<User[]>([])
  const [activeTotal, setActiveTotal] = React.useState(0)
  const [inactiveTotal, setInactiveTotal] = React.useState(0)
  const [activeLoading, setActiveLoading] = React.useState(true)
  const [inactiveLoading, setInactiveLoading] = React.useState(true)
  const [activeFilters, setActiveFilters] =
    React.useState<StudentFilters>(defaultFilters)
  const [inactiveFilters, setInactiveFilters] =
    React.useState<StudentFilters>(defaultFilters)

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
    (searchKey: string, sortKey: string, pageKey: string) => {
      const sortParam = parseSortParam(searchParams.get(sortKey))
      return {
        search: searchParams.get(searchKey) ?? '',
        sortBy: sortParam?.sortBy ?? defaultFilters.sortBy,
        sortDir: sortParam?.sortDir ?? defaultFilters.sortDir,
        page: parsePage(pageKey)
      }
    },
    [parsePage, parseSortParam, searchParams]
  )

  const currentActiveFilters = React.useMemo(
    () => buildFilters('activeSearch', 'activeSort', 'activePage'),
    [buildFilters]
  )
  const currentInactiveFilters = React.useMemo(
    () => buildFilters('inactiveSearch', 'inactiveSort', 'inactivePage'),
    [buildFilters]
  )

  React.useEffect(() => {
    setActiveFilters((prev) => {
      const next = {
        search: currentActiveFilters.search,
        sortBy: currentActiveFilters.sortBy,
        sortDir: currentActiveFilters.sortDir
      }
      return prev.search === next.search &&
        prev.sortBy === next.sortBy &&
        prev.sortDir === next.sortDir
        ? prev
        : next
    })
  }, [
    currentActiveFilters.search,
    currentActiveFilters.sortBy,
    currentActiveFilters.sortDir
  ])

  React.useEffect(() => {
    setInactiveFilters((prev) => {
      const next = {
        search: currentInactiveFilters.search,
        sortBy: currentInactiveFilters.sortBy,
        sortDir: currentInactiveFilters.sortDir
      }
      return prev.search === next.search &&
        prev.sortBy === next.sortBy &&
        prev.sortDir === next.sortDir
        ? prev
        : next
    })
  }, [
    currentInactiveFilters.search,
    currentInactiveFilters.sortBy,
    currentInactiveFilters.sortDir
  ])

  const updateParams = React.useCallback(
    (
      keys: { searchKey: string; sortKey: string; pageKey: string },
      filters: StudentFilters,
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

  const loadStudents = React.useCallback(
    async (options: {
      isActive: boolean
      search: string
      sort: { sortBy: string; sortDir: 'asc' | 'desc' }
      page: number
    }) => {
      const { isActive, search, sort, page } = options
      const params = new URLSearchParams()
      params.set('role', 'student')
      params.set('isActive', String(isActive))
      if (search.trim()) {
        params.set('q', search.trim())
      }
      params.set('sortBy', sort.sortBy)
      params.set('sortDir', sort.sortDir)
      params.set('limit', String(pageSize))
      params.set('offset', String((page - 1) * pageSize))

      if (isActive) {
        setActiveLoading(true)
      } else {
        setInactiveLoading(true)
      }

      try {
        const response = await fetch(`/api/users?${params.toString()}`)
        if (!response.ok) {
          throw new Error('Impossibile caricare gli studenti.')
        }
        const payload = await response.json()
        const { items, total } = normalizePaged<User>(payload)
        if (isActive) {
          setActiveStudents(items)
          setActiveTotal(total)
        } else {
          setInactiveStudents(items)
          setInactiveTotal(total)
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Impossibile caricare gli studenti.'
        toast.error(message)
      } finally {
        if (isActive) {
          setActiveLoading(false)
        } else {
          setInactiveLoading(false)
        }
      }
    },
    []
  )

  React.useEffect(() => {
    void loadStudents({
      isActive: true,
      search: currentActiveFilters.search,
      sort: {
        sortBy: currentActiveFilters.sortBy,
        sortDir: currentActiveFilters.sortDir
      },
      page: currentActiveFilters.page
    })
  }, [
    currentActiveFilters.page,
    currentActiveFilters.search,
    currentActiveFilters.sortBy,
    currentActiveFilters.sortDir,
    loadStudents
  ])

  React.useEffect(() => {
    void loadStudents({
      isActive: false,
      search: currentInactiveFilters.search,
      sort: {
        sortBy: currentInactiveFilters.sortBy,
        sortDir: currentInactiveFilters.sortDir
      },
      page: currentInactiveFilters.page
    })
  }, [
    currentInactiveFilters.page,
    currentInactiveFilters.search,
    currentInactiveFilters.sortBy,
    currentInactiveFilters.sortDir,
    loadStudents
  ])

  const makeColumns = React.useCallback(() => {
    const columns: ColumnDef<User>[] = [
      {
        accessorKey: 'lastName',
        header: 'Cognome',
        cell: ({ row }) => row.original.lastName
      },
      {
        accessorKey: 'firstName',
        header: 'Nome',
        cell: ({ row }) => row.original.firstName
      },
      {
        accessorKey: 'year',
        header: 'Classe',
        cell: ({ row }) => (
          <span>{classLabel(row.original.year, row.original.sectionName) ?? '-'}</span>
        )
      },
      {
        accessorKey: 'lessonTokens',
        header: () => (
          <span className='whitespace-nowrap'>Ore di lezione rimanenti</span>
        ),
        cell: ({ row }) => row.original.lessonTokens ?? '-',
        enableSorting: false
      }
    ]

    return columns
  }, [])

  const activeColumns = React.useMemo(() => makeColumns(), [makeColumns])
  const inactiveColumns = React.useMemo(() => makeColumns(), [makeColumns])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <PageHeader title='Gestione studenti' backHref='/admin' />
          <div className='mt-8 space-y-6'>
            <Tabs value={listTab} onValueChange={(value) => setParam('tab', value === 'active' ? null : value)}>
              <TabsList>
                <TabsTrigger value='active'>Attivi ({activeTotal})</TabsTrigger>
                <TabsTrigger value='inactive'>
                  Inattivi ({inactiveTotal})
                </TabsTrigger>
              </TabsList>
              <TabsContent value='active' className='mt-6'>
                <FilterForm
                  values={activeFilters}
                  applied={currentActiveFilters}
                  onSubmit={(event) => {
                    event.preventDefault()
                    updateParams({ searchKey: 'activeSearch', sortKey: 'activeSort', pageKey: 'activePage' }, activeFilters, 1)
                  }}
                  search={{
                    id: 'active-student-search',
                    value: activeFilters.search,
                    onChange: (value) => setActiveFilters((prev) => ({ ...prev, search: value })),
                    placeholder: 'Nome, cognome o email'
                  }}
                />
                <div className='mt-6'>
                  <DataTable
                    sortable={SORTABLE}
                    sort={{ sortBy: currentActiveFilters.sortBy, sortDir: currentActiveFilters.sortDir }}
                    onSort={(key) => {
                      const next = { ...activeFilters, ...nextSort(currentActiveFilters, key) }
                      setActiveFilters(next)
                      updateParams({ searchKey: 'activeSearch', sortKey: 'activeSort', pageKey: 'activePage' }, next, 1)
                    }}
                    data={activeStudents}
                    columns={activeColumns}
                    rowHref={(row) => `/admin/students/${row.id}`}
                    isLoading={activeLoading}
                    emptyMessage='Nessuno studente attivo.'
                    pageKey='activePage'
                    page={currentActiveFilters.page}
                    pageSize={pageSize}
                    total={activeTotal}
                  />
                </div>
              </TabsContent>
              <TabsContent value='inactive' className='mt-6'>
                <FilterForm
                  values={inactiveFilters}
                  applied={currentInactiveFilters}
                  onSubmit={(event) => {
                    event.preventDefault()
                    updateParams({ searchKey: 'inactiveSearch', sortKey: 'inactiveSort', pageKey: 'inactivePage' }, inactiveFilters, 1)
                  }}
                  search={{
                    id: 'inactive-student-search',
                    value: inactiveFilters.search,
                    onChange: (value) => setInactiveFilters((prev) => ({ ...prev, search: value })),
                    placeholder: 'Nome, cognome o email'
                  }}
                />
                <div className='mt-6'>
                  <DataTable
                    sortable={SORTABLE}
                    sort={{ sortBy: currentInactiveFilters.sortBy, sortDir: currentInactiveFilters.sortDir }}
                    onSort={(key) => {
                      const next = { ...inactiveFilters, ...nextSort(currentInactiveFilters, key) }
                      setInactiveFilters(next)
                      updateParams({ searchKey: 'inactiveSearch', sortKey: 'inactiveSort', pageKey: 'inactivePage' }, next, 1)
                    }}
                    data={inactiveStudents}
                    columns={inactiveColumns}
                    rowHref={(row) => `/admin/students/${row.id}`}
                    isLoading={inactiveLoading}
                    emptyMessage='Nessuno studente in attesa.'
                    pageKey='inactivePage'
                    page={currentInactiveFilters.page}
                    pageSize={pageSize}
                    total={inactiveTotal}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </main>
  )
}
