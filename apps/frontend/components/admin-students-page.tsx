'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { ArrowUpDown, MoreHorizontal, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const pageSize = 15

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
  searchPlaceholder: string
  isLoading: boolean
  emptyMessage: string
  searchKey: string
  sortKey: string
  pageKey: string
  page: number
  pageSize: number
  total: number
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
  columns,
  searchPlaceholder,
  isLoading,
  emptyMessage,
  searchKey,
  sortKey,
  pageKey,
  page,
  pageSize,
  total
}: DataTableProps<TData>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()

  const parseSorting = React.useCallback((value: string | null) => {
    if (!value) {
      return []
    }
    const [id, direction] = value.split(':')
    if (!id) {
      return []
    }
    return [{ id, desc: direction === 'desc' }]
  }, [])

  const [sorting, setSorting] = React.useState<SortingState>(() =>
    parseSorting(searchParams.get(sortKey))
  )
  const [globalFilter, setGlobalFilter] = React.useState(
    () => searchParams.get(searchKey) ?? ''
  )
  const [debouncedFilter, setDebouncedFilter] = React.useState(globalFilter)
  const didInitRef = React.useRef(false)
  const lastNavigationRef = React.useRef('')

  React.useEffect(() => {
    const nextFilter = searchParams.get(searchKey) ?? ''
    setGlobalFilter((prev) => (prev === nextFilter ? prev : nextFilter))
    const nextSorting = parseSorting(searchParams.get(sortKey))
    setSorting((prev) => {
      const currentSort = prev[0]
      const nextSort = nextSorting[0]
      const isSameSort =
        (!currentSort && !nextSort) ||
        (currentSort &&
          nextSort &&
          currentSort.id === nextSort.id &&
          currentSort.desc === nextSort.desc)
      return isSameSort ? prev : nextSorting
    })
  }, [parseSorting, searchKey, searchParams, sortKey])

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedFilter(globalFilter)
    }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [globalFilter])

  React.useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true
      return
    }

    const currentFilter = searchParams.get(searchKey) ?? ''
    const desiredFilter = debouncedFilter
    const filterChanged = currentFilter !== desiredFilter

    const desiredSort = sorting[0]
      ? `${sorting[0].id}:${sorting[0].desc ? 'desc' : 'asc'}`
      : null
    const currentSort = searchParams.get(sortKey)
    const sortChanged = desiredSort !== currentSort

    const currentPage = searchParams.get(pageKey) ?? ''
    const pageChanged = page > 1 ? currentPage !== String(page) : currentPage !== ''

    if (!filterChanged && !sortChanged && !pageChanged) {
      return
    }

    const params = new URLSearchParams(searchParamsString)
    if (desiredFilter) {
      params.set(searchKey, desiredFilter)
    } else {
      params.delete(searchKey)
    }
    if (desiredSort) {
      params.set(sortKey, desiredSort)
    } else {
      params.delete(sortKey)
    }
    if (page > 1) {
      params.set(pageKey, String(page))
    } else {
      params.delete(pageKey)
    }

    const nextParams = params.toString()
    const url = nextParams ? `${pathname}?${nextParams}` : pathname
    if (lastNavigationRef.current === url) {
      return
    }
    lastNavigationRef.current = url
    router.replace(url, { scroll: false })
  }, [
    debouncedFilter,
    pathname,
    page,
    router,
    searchKey,
    searchParams,
    searchParamsString,
    sortKey,
    sorting,
    pageKey
  ])

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
    state: {
      sorting
    },
    onSortingChange: setSorting,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true
  })

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='relative max-w-xs'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            type='search'
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className='pl-9'
          />
        </div>
      </div>
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
            disabled={page >= totalPages || isLoading}
          >
            Successiva
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function AdminStudentsPage() {
  const searchParams = useSearchParams()
  const [activeStudents, setActiveStudents] = React.useState<User[]>([])
  const [inactiveStudents, setInactiveStudents] = React.useState<User[]>([])
  const [activeTotal, setActiveTotal] = React.useState(0)
  const [inactiveTotal, setInactiveTotal] = React.useState(0)
  const [activeLoading, setActiveLoading] = React.useState(true)
  const [inactiveLoading, setInactiveLoading] = React.useState(true)
  const [activeError, setActiveError] = React.useState<string | null>(null)
  const [inactiveError, setInactiveError] = React.useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null)

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

  const loadStudents = React.useCallback(
    async (options: {
      isActive: boolean
      search: string
      sort: { sortBy: string; sortDir: 'asc' | 'desc' } | null
      page: number
    }) => {
      const { isActive, search, sort, page } = options
      const params = new URLSearchParams()
      params.set('role', 'student')
      params.set('isActive', String(isActive))
      if (search) {
        params.set('q', search)
      }
      if (sort) {
        params.set('sortBy', sort.sortBy)
        params.set('sortDir', sort.sortDir)
      }
      params.set('limit', String(pageSize))
      params.set('offset', String((page - 1) * pageSize))

      if (isActive) {
        setActiveLoading(true)
        setActiveError(null)
      } else {
        setInactiveLoading(true)
        setInactiveError(null)
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
        if (isActive) {
          setActiveError(message)
        } else {
          setInactiveError(message)
        }
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

  const activeSearch = searchParams.get('activeSearch') ?? ''
  const inactiveSearch = searchParams.get('inactiveSearch') ?? ''
  const activeSortParam = searchParams.get('activeSort') ?? ''
  const inactiveSortParam = searchParams.get('inactiveSort') ?? ''
  const activeSort = React.useMemo(
    () => parseSortParam(activeSortParam),
    [activeSortParam, parseSortParam]
  )
  const inactiveSort = React.useMemo(
    () => parseSortParam(inactiveSortParam),
    [inactiveSortParam, parseSortParam]
  )
  const activePage = parsePage('activePage')
  const inactivePage = parsePage('inactivePage')

  React.useEffect(() => {
    void loadStudents({
      isActive: true,
      search: activeSearch,
      sort: activeSort,
      page: activePage
    })
  }, [activePage, activeSearch, activeSort, loadStudents])

  React.useEffect(() => {
    void loadStudents({
      isActive: false,
      search: inactiveSearch,
      sort: inactiveSort,
      page: inactivePage
    })
  }, [inactivePage, inactiveSearch, inactiveSort, loadStudents])

  const getSectionLabel = React.useCallback((user: User) => {
    if (user.sectionName) {
      return user.sectionName
    }
    return user.sectionId ?? '-'
  }, [])

  const makeColumns = React.useCallback(() => {
    const columns: ColumnDef<User>[] = [
      {
        accessorKey: 'lastName',
        header: ({ column }) => (
          <Button
            variant='ghost'
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Cognome
            <ArrowUpDown className='ml-2 h-4 w-4' />
          </Button>
        ),
        cell: ({ row }) => row.original.lastName
      },
      {
        accessorKey: 'firstName',
        header: ({ column }) => (
          <Button
            variant='ghost'
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Nome
            <ArrowUpDown className='ml-2 h-4 w-4' />
          </Button>
        ),
        cell: ({ row }) => row.original.firstName
      },
      {
        accessorKey: 'year',
        header: ({ column }) => (
          <Button
            variant='ghost'
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Classe
            <ArrowUpDown className='ml-2 h-4 w-4' />
          </Button>
        ),
        cell: ({ row }) => (
          <span>
            {row.original.year ?? ''}
            {getSectionLabel(row.original)}
          </span>
        )
      },
      {
        accessorKey: 'lessonTokens',
        header: 'Crediti lezione',
        cell: ({ row }) => row.original.lessonTokens ?? '-',
        enableSorting: false
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <DropdownMenu
            open={openMenuId === row.original.id}
            onOpenChange={(open) =>
              setOpenMenuId(open ? row.original.id : null)
            }
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                aria-label='Azioni'
                className='h-6 w-6 p-0'
              >
                <MoreHorizontal className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem asChild>
                <Link href={`/admin/students/${row.original.id}`}>
                  Dettagli
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    ]

    return columns
  }, [getSectionLabel, openMenuId])

  const activeColumns = React.useMemo(() => makeColumns(), [makeColumns])
  const inactiveColumns = React.useMemo(() => makeColumns(), [makeColumns])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Gestione studenti</h1>
            <Button asChild variant='outline'>
              <Link href='/admin'>Torna al pannello</Link>
            </Button>
          </div>
          <div className='mt-8 space-y-6'>
            <Tabs defaultValue='active'>
              <TabsList>
                <TabsTrigger value='active'>Attivi ({activeTotal})</TabsTrigger>
                <TabsTrigger value='inactive'>
                  Inattivi ({inactiveTotal})
                </TabsTrigger>
              </TabsList>
              <TabsContent value='active' className='mt-6'>
                <DataTable
                  data={activeStudents}
                  columns={activeColumns}
                  searchPlaceholder='Cerca studente'
                  isLoading={activeLoading}
                  emptyMessage='Nessuno studente attivo.'
                  searchKey='activeSearch'
                  sortKey='activeSort'
                  pageKey='activePage'
                  page={activePage}
                  pageSize={pageSize}
                  total={activeTotal}
                />
                {activeError && (
                  <p className='mt-3 text-sm text-destructive'>{activeError}</p>
                )}
              </TabsContent>
              <TabsContent value='inactive' className='mt-6'>
                <DataTable
                  data={inactiveStudents}
                  columns={inactiveColumns}
                  searchPlaceholder='Cerca studente'
                  isLoading={inactiveLoading}
                  emptyMessage='Nessuno studente in attesa.'
                  searchKey='inactiveSearch'
                  sortKey='inactiveSort'
                  pageKey='inactivePage'
                  page={inactivePage}
                  pageSize={pageSize}
                  total={inactiveTotal}
                />
                {inactiveError && (
                  <p className='mt-3 text-sm text-destructive'>
                    {inactiveError}
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </main>
  )
}
