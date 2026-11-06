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
import { Checkbox } from './ui/checkbox'
import { logout } from '@/lib/auth-client'
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

function confirmTitle(change: PendingChange | null) {
  if (!change) return ''
  const verb = change.activate ? 'Attivare' : 'Disattivare'
  return change.students.length === 1
    ? `${verb} questo studente?`
    : `${verb} ${change.students.length} studenti?`
}

function confirmDescription(change: PendingChange | null) {
  if (!change) return ''
  const one = change.students.length === 1
  if (change.activate) {
    return one
      ? 'Controlla che sia la persona giusta: una volta attivo potrà accedere e prenotare lezioni.'
      : 'Controlla che siano le persone giuste: una volta attivi potranno accedere e prenotare lezioni.'
  }
  return one
    ? 'Controlla che sia la persona giusta: una volta disattivato non potrà più prenotare lezioni finché non viene riattivato.'
    : 'Controlla che siano le persone giuste: una volta disattivati non potranno più prenotare lezioni finché non vengono riattivati.'
}

function confirmAction(change: PendingChange | null) {
  if (!change) return ''
  const verb = change.activate ? 'Attiva' : 'Disattiva'
  return change.students.length === 1
    ? verb
    : `${verb} ${change.students.length} studenti`
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
  onRequestChange
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
      <div className='flex gap-2 items-center justify-end'>
        <Button
          variant={tab === 'inactive' ? 'default' : 'destructive'}
          disabled={
            table.getFilteredSelectedRowModel().rows.length === 0 ||
            isSubmitting
          }
          onClick={() =>
            onRequestChange({
              students: table
                .getFilteredSelectedRowModel()
                .rows.map((row) => row.original as unknown as User),
              activate: tab === 'inactive'
            })
          }
        >
          {isSubmitting
            ? 'Aggiornando...'
            : tab === 'inactive'
              ? 'Attiva selezionati'
              : 'Disattiva selezionati'}
        </Button>
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
          Pagina {page} di {totalPages} · Totale {total} <br />
          {table.getFilteredSelectedRowModel().rows.length} di{' '}
          {table.getFilteredRowModel().rows.length} righe selezionate
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

export default function ActivatorStudentsPage() {
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
  const [isSubmitting, setIsSubmitting] = React.useState(false)
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

  const resetActiveFilters = React.useCallback(() => {
    setActiveFilters(defaultFilters)
    updateParams(
      {
        searchKey: 'activeSearch',
        sortKey: 'activeSort',
        pageKey: 'activePage'
      },
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

  async function handleLogout() {
    await logout()
  }

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

  async function activateStudent(studentId: string, value: true | false) {
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/users/${studentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isActive: value
        })
      })

      if (!response.ok) {
        let message = value
          ? 'Impossibile attivare lo studente.'
          : 'Impossibile disattivare lo studente.'
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch {
          message = value
            ? 'Impossibile attivare lo studente.'
            : 'Impossibile disattivare lo studente.'
        }
        throw new Error(message)
      }

      toast.success(value ? 'Studente attivato.' : 'Studente disattivato.')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : value
            ? 'Impossibile attivare lo studente.'
            : 'Impossibile disattivare lo studente.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function confirmChange() {
    if (!pendingChange) return
    for (const student of pendingChange.students) {
      await activateStudent(student.id, pendingChange.activate)
    }
    setPendingChange(null)
    location.reload()
  }

  const makeColumns = React.useCallback(() => {
    const columns: ColumnDef<User>[] = [
      {
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
      },
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
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            variant={row.original.isActive ? 'destructive' : 'outline'}
            size='sm'
            onClick={() =>
              setPendingChange({
                students: [row.original],
                activate: !row.original.isActive
              })
            }
            disabled={isSubmitting}
          >
            {row.original.isActive ? 'Disattiva' : 'Attiva'}
          </Button>
        )
      }
    ]

    return columns
  }, [isSubmitting])

  const activeColumns = React.useMemo(() => makeColumns(), [makeColumns])
  const inactiveColumns = React.useMemo(() => makeColumns(), [makeColumns])

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
            <Tabs defaultValue='inactive'>
              <TabsList>
                <TabsTrigger value='inactive'>
                  Inattivi ({inactiveTotal})
                </TabsTrigger>
                <TabsTrigger value='active'>Attivi ({activeTotal})</TabsTrigger>
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
                          <SelectItem value='email'>Email</SelectItem>
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
                          <SelectItem value='email'>Email</SelectItem>
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
