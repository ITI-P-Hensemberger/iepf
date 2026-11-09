'use client'

import { cn } from '@/lib/utils'

import { nextSort, SortableHead, type SortDir } from '@/components/sortable-head'
import { ListPagination } from '@/components/list-pagination'
import { TableSkeletonRows, useFirstLoad } from '@/components/loading'
import { FilterForm } from '@/components/filter-form'
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { toast } from 'sonner'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, jsonBody } from '@/lib/api-fetch'

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSetParam } from '@/lib/back-link'
import { Checkbox } from './ui/checkbox'
import { logout } from '@/lib/auth-client'
import { classLabel } from '@/lib/class-label'
import { useResetOnChange } from '@/lib/use-reset-on-change'

const pageSize = 20

const SORTABLE = ['lastName', 'firstName', 'year', 'email'] as const

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
  data: TData[]
  columns: ColumnDef<TData>[]
  isLoading: boolean
  emptyMessage: string
  pageKey: string
  page: number
  pageSize: number
  total: number
  tab?: 'active' | 'inactive'
  isSubmitting?: boolean
  // Activating and deactivating always go through the confirmation dialog.
  onRequestChange: (change: PendingChange) => void
  // Columns whose header sorts the list, and the sort in use.
  sortable?: readonly string[]
  sort?: { sortBy: string, sortDir: SortDir }
  onSort?: (key: string) => void
}

type PendingChange = { students: User[]; activate: boolean }

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

// Activators only turn students on: deactivating is up to an admin.
function confirmTitle(change: PendingChange | null) {
  if (!change) return ''
  return change.students.length === 1
    ? 'Attivare questo studente?'
    : `Attivare ${change.students.length} studenti?`
}

function confirmDescription(change: PendingChange | null) {
  if (!change) return ''
  return change.students.length === 1
    ? 'Controlla che sia la persona giusta: una volta attivo potrà accedere e prenotare lezioni.'
    : 'Controlla che siano le persone giuste: una volta attivi potranno accedere e prenotare lezioni.'
}

function confirmAction(change: PendingChange | null) {
  if (!change) return ''
  return change.students.length === 1
    ? 'Attiva'
    : `Attiva ${change.students.length} studenti`
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
  tab,
  isSubmitting,
  onRequestChange,
  sortable,
  sort,
  onSort
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

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    // Selection by student, not by row position: after a change the list reloads in place.
    getRowId: (row) => (row as { id: string }).id,
    getCoreRowModel: getCoreRowModel()
  })

  const firstLoad = useFirstLoad(isLoading)
  return (
    <div className='space-y-4'>
      {tab === 'inactive' && (
      <div className='flex gap-2 items-center justify-end'>
        <Button
          disabled={
            table.getFilteredSelectedRowModel().rows.length === 0 ||
            isSubmitting
          }
          onClick={() =>
            onRequestChange({
              students: table
                .getFilteredSelectedRowModel()
                .rows.map((row) => row.original as unknown as User),
              activate: true
            })
          }
        >
          {isSubmitting ? 'Aggiornando...' : 'Attiva selezionati'}
        </Button>
      </div>
      )}
      <div className='rounded-lg border'>
        <Table>
          <TableHeader sticky className='bg-muted/50'>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
      <ListPagination page={page} pageSize={pageSize} total={total} onPageChange={(next) => updatePage(next)} loading={isLoading} />
    </div>
  )
}

type TableFilters = {
  search: string
  sortBy: string
  sortDir: 'asc' | 'desc'
}

const defaultFilters: TableFilters = {
  search: '',
  sortBy: 'lastName',
  sortDir: 'asc'
}

// A list's request: active or waiting students, then the search, sort and page from the URL.
function listQuery(filters: TableFilters & { page: number }, isActive: boolean) {
  const params = new URLSearchParams({ role: 'student', isActive: String(isActive) })
  if (filters.search.trim()) params.set('q', filters.search.trim())
  params.set('sortBy', filters.sortBy)
  params.set('sortDir', filters.sortDir)
  params.set('limit', String(pageSize))
  params.set('offset', String((filters.page - 1) * pageSize))
  return params.toString()
}

// Stable while nothing has loaded, so the tables do not rebuild on every render.
const noStudents: User[] = []

export default function ActivatorStudentsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const setParam = useSetParam()
  // The open tab lives in the URL, so it is still open after a trip to a detail page and back.
  const listTab = (['active'] as const).find((value) => value === searchParams.get('tab')) ?? 'inactive'
  const searchParamsString = searchParams.toString()
  const [pendingChange, setPendingChange] =
    React.useState<PendingChange | null>(null)
  const [activeFilters, setActiveFilters] =
    React.useState<TableFilters>(defaultFilters)
  const [inactiveFilters, setInactiveFilters] =
    React.useState<TableFilters>(defaultFilters)

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

  // Follows the URL when it changes from outside (back, a link, a reset).
  useResetOnChange({
    search: currentActiveFilters.search,
    sortBy: currentActiveFilters.sortBy,
    sortDir: currentActiveFilters.sortDir
  }, setActiveFilters)

  // Follows the URL when it changes from outside (back, a link, a reset).
  useResetOnChange({
    search: currentInactiveFilters.search,
    sortBy: currentInactiveFilters.sortBy,
    sortDir: currentInactiveFilters.sortDir
  }, setInactiveFilters)

  const updateParams = React.useCallback(
    (
      keys: { searchKey: string; sortKey: string; pageKey: string },
      filters: TableFilters,
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

  async function handleLogout() {
    await logout()
  }

  const queryClient = useQueryClient()
  const activeQuery = listQuery(currentActiveFilters, true)
  const inactiveQuery = listQuery(currentInactiveFilters, false)
  // The rows stay in place while the next page or search loads.
  const activeResult = useQuery({
    queryKey: ['users', activeQuery],
    queryFn: async () => normalizePaged<User>(await apiFetch(`/api/users?${activeQuery}`, 'Impossibile caricare gli studenti.')),
    placeholderData: keepPreviousData
  })
  const inactiveResult = useQuery({
    queryKey: ['users', inactiveQuery],
    queryFn: async () => normalizePaged<User>(await apiFetch(`/api/users?${inactiveQuery}`, 'Impossibile caricare gli studenti.')),
    placeholderData: keepPreviousData
  })
  const activeStudents = activeResult.data?.items ?? noStudents
  const activeTotal = activeResult.data?.total ?? 0
  const activeLoading = activeResult.isFetching
  const inactiveStudents = inactiveResult.data?.items ?? noStudents
  const inactiveTotal = inactiveResult.data?.total ?? 0
  const inactiveLoading = inactiveResult.isFetching

  const setActive = useMutation({
    mutationFn: ({ id, value }: { id: string, value: boolean }) => apiFetch(
      `/api/users/${id}`,
      value ? 'Impossibile attivare lo studente.' : 'Impossibile disattivare lo studente.',
      jsonBody('PATCH', { isActive: value })
    ),
    onSuccess: (_, { value }) => {
      toast.success(value ? 'Studente attivato.' : 'Studente disattivato.')
    }
  })
  const isSubmitting = setActive.isPending

  // One student at a time, each with its own message; a failure does not stop the others.
  async function confirmChange() {
    if (!pendingChange) return
    for (const student of pendingChange.students) {
      await setActive.mutateAsync({ id: student.id, value: pendingChange.activate }).catch(() => {})
    }
    setPendingChange(null)
    await queryClient.invalidateQueries({ queryKey: ['users'] })
  }

  const makeColumns = React.useCallback((activatable: boolean) => {
    const select: ColumnDef<User> = {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            disabled={table.getRowModel().rows.length === 0 || isSubmitting}
            aria-label='Select all'
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            disabled={isSubmitting}
            aria-label='Select row'
          />
        ),
        enableSorting: false,
        enableHiding: false
      }
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
        accessorKey: 'email',
        header: 'Email @hensemberger.it',
        cell: ({ row }) => <span>{row.original.email.split('@')[0]}</span>
      }
    ]
    if (!activatable) return columns

    const activate: ColumnDef<User> = {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant='outline'
          size='sm'
          onClick={() => setPendingChange({ students: [row.original], activate: true })}
          disabled={isSubmitting}
        >
          Attiva
        </Button>
      )
    }
    return [select, ...columns, activate]
  }, [isSubmitting])

  const activeColumns = React.useMemo(() => makeColumns(false), [makeColumns])
  const inactiveColumns = React.useMemo(() => makeColumns(true), [makeColumns])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Attivazione studenti</h1>
            <Button variant='destructive' onClick={handleLogout}>
              Esci
            </Button>
          </div>
          <div className='mt-8 space-y-6'>
            <Tabs value={listTab} onValueChange={(value) => setParam('tab', value === 'inactive' ? null : value)}>
              <TabsList>
                <TabsTrigger value='inactive'>
                  Inattivi ({inactiveTotal})
                </TabsTrigger>
                <TabsTrigger value='active'>Attivi ({activeTotal})</TabsTrigger>
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
                    isLoading={activeLoading}
                    emptyMessage='Nessuno studente attivo.'
                    pageKey='activePage'
                    page={currentActiveFilters.page}
                    pageSize={pageSize}
                    total={activeTotal}
                    isSubmitting={isSubmitting}
                    onRequestChange={setPendingChange}
                    tab='active'
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
                    isLoading={inactiveLoading}
                    emptyMessage='Nessuno studente in attesa.'
                    pageKey='inactivePage'
                    page={currentInactiveFilters.page}
                    pageSize={pageSize}
                    total={inactiveTotal}
                    isSubmitting={isSubmitting}
                    onRequestChange={setPendingChange}
                    tab='inactive'
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <AlertDialog
        open={pendingChange !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) setPendingChange(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle(pendingChange)}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDescription(pendingChange)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className='max-h-64 divide-y overflow-y-auto rounded-md border text-sm'>
            {pendingChange?.students.map((student) => (
              <li key={student.id} className='px-3 py-2'>
                <div className='font-medium'>
                  {student.lastName} {student.firstName}
                </div>
                <div className='text-xs text-muted-foreground'>
                  {classLabel(student.year, student.sectionName) ?? '-'} · {student.email}
                </div>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant={pendingChange?.activate ? 'default' : 'destructive'}
              disabled={isSubmitting}
              onClick={(event) => {
                event.preventDefault()
                void confirmChange()
              }}
            >
              {isSubmitting
                ? pendingChange?.activate
                  ? 'Attivazione...'
                  : 'Disattivazione...'
                : confirmAction(pendingChange)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
