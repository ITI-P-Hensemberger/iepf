'use client'

import { cn } from '@/lib/utils'

import { nextSort, SortableHead, type SortDir } from '@/components/sortable-head'
import { ListPagination } from '@/components/list-pagination'
import { TableSkeletonRows, useFirstLoad } from '@/components/loading'
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-fetch'

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

  const firstLoad = useFirstLoad(isLoading)
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
          <TableBody className={cn(isLoading && 'opacity-60 transition-opacity')} aria-busy={isLoading}>
            {firstLoad ? (
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

// The lists, each with its own search, sort and page in the URL. "inactive" keeps its old key:
// links and bookmarks to the waiting students still open the right tab.
const LISTS = [
  { value: 'active', label: 'Attivi', query: { isActive: 'true' }, empty: 'Nessuno studente attivo.' },
  { value: 'inactive', label: 'In attesa', query: { isActive: 'false', deactivated: 'false' }, empty: 'Nessuno studente in attesa di attivazione.' },
  { value: 'deactivated', label: 'Disattivati', query: { isActive: 'false', deactivated: 'true' }, empty: 'Nessuno studente disattivato.' }
] as const

type ListKey = (typeof LISTS)[number]['value']
const paramKeys = (list: ListKey) => ({ searchKey: `${list}Search`, sortKey: `${list}Sort`, pageKey: `${list}Page` })

function readFilters(searchParams: URLSearchParams, list: ListKey) {
  const keys = paramKeys(list)
  const [sortBy, direction] = (searchParams.get(keys.sortKey) ?? '').split(':')
  const page = Math.floor(Number(searchParams.get(keys.pageKey)))
  return {
    search: searchParams.get(keys.searchKey) ?? '',
    sortBy: sortBy || defaultFilters.sortBy,
    sortDir: (sortBy ? (direction === 'desc' ? 'desc' : 'asc') : defaultFilters.sortDir) as 'asc' | 'desc',
    page: Number.isFinite(page) && page >= 1 ? page : 1
  }
}

// One list's rows, loaded whenever its filters in the URL change.
function useStudentList(list: (typeof LISTS)[number], applied: ReturnType<typeof readFilters>) {
  const params = new URLSearchParams({ role: 'student', ...list.query })
  if (applied.search.trim()) params.set('q', applied.search.trim())
  params.set('sortBy', applied.sortBy)
  params.set('sortDir', applied.sortDir)
  params.set('limit', String(pageSize))
  params.set('offset', String((applied.page - 1) * pageSize))
  const query = params.toString()
  const { data, isFetching } = useQuery({
    queryKey: ['users', query],
    queryFn: async () => normalizePaged<User>(await apiFetch(`/api/users?${query}`, 'Impossibile caricare gli studenti.')),
    // The rows stay in place while the next page or search loads.
    placeholderData: keepPreviousData
  })
  return { students: data?.items ?? noStudents, total: data?.total ?? 0, loading: isFetching }
}

// Stable while nothing has loaded, so the table does not rebuild on every render.
const noStudents: User[] = []

const COLUMNS: ColumnDef<User>[] = [
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

function StudentList({ list, applied, data }: {
  list: (typeof LISTS)[number]
  applied: ReturnType<typeof readFilters>
  data: ReturnType<typeof useStudentList>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const keys = paramKeys(list.value)
  const [filters, setFilters] = React.useState<StudentFilters>(applied)

  // Follows the URL when it changes from outside (back, a link).
  React.useEffect(() => {
    setFilters({ search: applied.search, sortBy: applied.sortBy, sortDir: applied.sortDir })
  }, [applied.search, applied.sortBy, applied.sortDir])

  const apply = (next: StudentFilters) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.search) params.set(keys.searchKey, next.search)
    else params.delete(keys.searchKey)
    params.set(keys.sortKey, `${next.sortBy}:${next.sortDir}`)
    params.delete(keys.pageKey)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <>
      <FilterForm
        values={filters}
        applied={applied}
        onSubmit={(event) => {
          event.preventDefault()
          apply(filters)
        }}
        search={{
          id: `${list.value}-student-search`,
          value: filters.search,
          onChange: (value) => setFilters((prev) => ({ ...prev, search: value })),
          placeholder: 'Nome, cognome o email'
        }}
      />
      <div className='mt-6'>
        <DataTable
          sortable={SORTABLE}
          sort={{ sortBy: applied.sortBy, sortDir: applied.sortDir }}
          onSort={(key) => {
            const next = { ...filters, ...nextSort(applied, key) }
            setFilters(next)
            apply(next)
          }}
          data={data.students}
          columns={COLUMNS}
          rowHref={(row) => `/admin/students/${row.id}`}
          isLoading={data.loading}
          emptyMessage={list.empty}
          pageKey={keys.pageKey}
          page={applied.page}
          pageSize={pageSize}
          total={data.total}
        />
      </div>
    </>
  )
}

export default function AdminStudentsPage() {
  const searchParams = useSearchParams()
  const setParam = useSetParam()
  // The open tab lives in the URL, so it is still open after a trip to a detail page and back.
  const listTab: ListKey = LISTS.find(list => list.value === searchParams.get('tab'))?.value ?? 'active'
  const searchParamsString = searchParams.toString()
  const applied = React.useMemo(() => {
    const params = new URLSearchParams(searchParamsString)
    return {
      active: readFilters(params, 'active'),
      inactive: readFilters(params, 'inactive'),
      deactivated: readFilters(params, 'deactivated')
    }
  }, [searchParamsString])
  // All three load at once: each tab shows its count.
  const data = {
    active: useStudentList(LISTS[0], applied.active),
    inactive: useStudentList(LISTS[1], applied.inactive),
    deactivated: useStudentList(LISTS[2], applied.deactivated)
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <PageHeader title='Gestione studenti' backHref='/admin' />
          <div className='mt-8 space-y-6'>
            <Tabs value={listTab} onValueChange={(value) => setParam('tab', value === 'active' ? null : value)}>
              <TabsList>
                {LISTS.map(list => (
                  <TabsTrigger key={list.value} value={list.value}>
                    {list.label} ({data[list.value].total})
                  </TabsTrigger>
                ))}
              </TabsList>
              {LISTS.map(list => (
                <TabsContent key={list.value} value={list.value} className='mt-6'>
                  <StudentList list={list} applied={applied[list.value]} data={data[list.value]} />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </div>
    </main>
  )
}
