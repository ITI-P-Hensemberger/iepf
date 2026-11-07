'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
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
import { classLabel } from '@/lib/class-label'

const pageSize = 20

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
  total
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
                  <TableHead
                    key={header.id}
                    className={
                      header.column.id === 'actions' ? 'w-16' : undefined
                    }
                  >
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
                <TableRow
                  key={row.id}
                  className={rowHref ? 'cursor-pointer' : undefined}
                  tabIndex={rowHref ? 0 : undefined}
                  onClick={rowHref
                    ? (event) => {
                        // Buttons and links inside the row keep their own action.
                        if ((event.target as HTMLElement).closest('a, button, input, [role="checkbox"]')) return
                        router.push(rowHref(row.original))
                      }
                    : undefined}
                  onKeyDown={rowHref
                    ? (event) => {
                        if (event.key === 'Enter' && event.target === event.currentTarget) router.push(rowHref(row.original))
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

  const resetActiveFilters = React.useCallback(() => {
    setActiveFilters(defaultFilters)
    updateParams(
      { searchKey: 'activeSearch', sortKey: 'activeSort', pageKey: 'activePage' },
      defaultFilters,
      1
    )
  }, [updateParams])

  const resetInactiveFilters = React.useCallback(() => {
    setInactiveFilters(defaultFilters)
    updateParams(
      {
        searchKey: 'inactiveSearch',
        sortKey: 'inactiveSort',
        pageKey: 'inactivePage'
      },
      defaultFilters,
      1
    )
  }, [updateParams])

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
      if (search) {
        params.set('q', search)
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
            <Tabs defaultValue='active'>
              <TabsList>
                <TabsTrigger value='active'>Attivi ({activeTotal})</TabsTrigger>
                <TabsTrigger value='inactive'>
                  Inattivi ({inactiveTotal})
                </TabsTrigger>
              </TabsList>
              <TabsContent value='active' className='mt-6'>
                <form
                  className='rounded-lg border bg-card p-4 shadow-sm'
                  onSubmit={(event) => {
                    event.preventDefault()
                    updateParams(
                      {
                        searchKey: 'activeSearch',
                        sortKey: 'activeSort',
                        pageKey: 'activePage'
                      },
                      activeFilters,
                      1
                    )
                  }}
                >
                  <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                    <Field className='gap-2 lg:col-span-2'>
                      <FieldLabel htmlFor='active-student-search'>
                        Cerca
                      </FieldLabel>
                      <div className='relative'>
                        <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                        <Input
                          id='active-student-search'
                          type='search'
                          placeholder='Nome, cognome o email'
                          value={activeFilters.search}
                          onChange={(event) =>
                            setActiveFilters((prev) => ({
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
                        value={activeFilters.sortBy}
                        onValueChange={(value) =>
                          setActiveFilters((prev) => ({
                            ...prev,
                            sortBy: value
                          }))
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Ordinamento' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='lastName'>Cognome</SelectItem>
                          <SelectItem value='firstName'>Nome</SelectItem>
                          <SelectItem value='year'>Classe</SelectItem>
                          <SelectItem value='lessonTokens'>
                            Ore di lezione rimanenti
                          </SelectItem>
                          <SelectItem value='createdAt'>Creazione</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field className='gap-2'>
                      <FieldLabel>Direzione</FieldLabel>
                      <Select
                        value={activeFilters.sortDir}
                        onValueChange={(value) =>
                          setActiveFilters((prev) => ({
                            ...prev,
                            sortDir: value === 'desc' ? 'desc' : 'asc'
                          }))
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Direzione' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='asc'>Crescente</SelectItem>
                          <SelectItem value='desc'>Decrescente</SelectItem>
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
                        onClick={resetActiveFilters}
                      >
                        Reset filtri
                      </Button>
                      <Button type='submit'>
                        Applica filtri
                      </Button>
                    </div>
                  </div>
                </form>
                <div className='mt-6'>
                  <DataTable
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
                <form
                  className='rounded-lg border bg-card p-4 shadow-sm'
                  onSubmit={(event) => {
                    event.preventDefault()
                    updateParams(
                      {
                        searchKey: 'inactiveSearch',
                        sortKey: 'inactiveSort',
                        pageKey: 'inactivePage'
                      },
                      inactiveFilters,
                      1
                    )
                  }}
                >
                  <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                    <Field className='gap-2 lg:col-span-2'>
                      <FieldLabel htmlFor='inactive-student-search'>
                        Cerca
                      </FieldLabel>
                      <div className='relative'>
                        <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                        <Input
                          id='inactive-student-search'
                          type='search'
                          placeholder='Nome, cognome o email'
                          value={inactiveFilters.search}
                          onChange={(event) =>
                            setInactiveFilters((prev) => ({
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
                        value={inactiveFilters.sortBy}
                        onValueChange={(value) =>
                          setInactiveFilters((prev) => ({
                            ...prev,
                            sortBy: value
                          }))
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Ordinamento' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='lastName'>Cognome</SelectItem>
                          <SelectItem value='firstName'>Nome</SelectItem>
                          <SelectItem value='year'>Classe</SelectItem>
                          <SelectItem value='lessonTokens'>
                            Ore di lezione rimanenti
                          </SelectItem>
                          <SelectItem value='createdAt'>Creazione</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field className='gap-2'>
                      <FieldLabel>Direzione</FieldLabel>
                      <Select
                        value={inactiveFilters.sortDir}
                        onValueChange={(value) =>
                          setInactiveFilters((prev) => ({
                            ...prev,
                            sortDir: value === 'desc' ? 'desc' : 'asc'
                          }))
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='Direzione' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='asc'>Crescente</SelectItem>
                          <SelectItem value='desc'>Decrescente</SelectItem>
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
                        onClick={resetInactiveFilters}
                      >
                        Reset filtri
                      </Button>
                      <Button type='submit'>
                        Applica filtri
                      </Button>
                    </div>
                  </div>
                </form>
                <div className='mt-6'>
                  <DataTable
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
