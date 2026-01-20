'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type ColumnDef,
  type FilterFn,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
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
import { useSession } from '@/lib/use-session'

type User = {
  id: string
  email: string
  firstName: string
  lastName: string
  role?: string | null
  sectionId?: string | null
  year?: number | null
  lessonTokens?: number | null
  isActive?: boolean | null
}

type Section = {
  id: string
  name: string
}

type DataTableProps = {
  data: User[]
  columns: ColumnDef<User>[]
  searchPlaceholder: string
  globalFilterFn: FilterFn<User>
  isLoading: boolean
  emptyMessage: string
  searchKey: string
  sortKey: string
}

function DataTable({
  data,
  columns,
  searchPlaceholder,
  globalFilterFn,
  isLoading,
  emptyMessage,
  searchKey,
  sortKey
}: DataTableProps) {
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
    const params = new URLSearchParams(searchParamsString)
    if (debouncedFilter) {
      params.set(searchKey, debouncedFilter)
    } else {
      params.delete(searchKey)
    }
    const currentSort = sorting[0]
    if (currentSort) {
      params.set(
        sortKey,
        `${currentSort.id}:${currentSort.desc ? 'desc' : 'asc'}`
      )
    } else {
      params.delete(sortKey)
    }
    const nextParams = params.toString()
    if (nextParams !== searchParamsString) {
      const url = nextParams ? `${pathname}?${nextParams}` : pathname
      router.replace(url, { scroll: false })
    }
  }, [
    debouncedFilter,
    pathname,
    router,
    searchKey,
    searchParamsString,
    sortKey,
    sorting
  ])

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel()
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
    </div>
  )
}

export default function AdminStudentsPage() {
  const [users, setUsers] = React.useState<User[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [actionId, setActionId] = React.useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null)
  const [sectionMap, setSectionMap] = React.useState<Map<string, string>>(
    () => new Map()
  )

  React.useEffect(() => {
    let isMounted = true

    async function loadSections() {
      try {
        const response = await fetch('/api/class-sections')
        if (!response.ok) {
          return
        }
        const data = (await response.json()) as Section[]
        if (isMounted) {
          setSectionMap(
            new Map(data.map((section) => [section.id, section.name]))
          )
        }
      } catch (err) {
        // Optional: skip showing section names if unavailable.
      }
    }

    async function loadUsers() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/users')
        if (!response.ok) {
          throw new Error('Impossibile caricare gli studenti.')
        }
        const data = (await response.json()) as User[]
        if (isMounted) {
          setUsers(data.filter((user) => user.role === 'student'))
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Impossibile caricare gli studenti.'
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadSections()
    void loadUsers()

    return () => {
      isMounted = false
    }
  }, [])

  const getSectionLabel = React.useCallback(
    (user: User) => {
      if (!user.sectionId) {
        return '-'
      }
      return sectionMap.get(user.sectionId) ?? user.sectionId
    },
    [sectionMap]
  )

  const globalFilterFn: FilterFn<User> = React.useCallback(
    (row, _columnId, value) => {
      const query = String(value ?? '')
        .toLowerCase()
        .trim()
      if (!query) {
        return true
      }
      const user = row.original
      const classLabel = `${user.year ?? ''}${getSectionLabel(user)}`
      const haystack =
        `${user.firstName ?? ''} ${user.lastName ?? ''} ${user.email ?? ''} ${classLabel}`.toLowerCase()
      return haystack.includes(query)
    },
    [getSectionLabel]
  )

  const sortByLastName = (list: User[]) =>
    [...list].sort((a, b) =>
      a.lastName.localeCompare(b.lastName, 'it', { sensitivity: 'base' })
    )

  const activeStudents = sortByLastName(users.filter((user) => user.isActive))
  const inactiveStudents = sortByLastName(
    users.filter((user) => !user.isActive)
  )

  async function handleToggleActive(user: User) {
    setActionId(user.id)
    setError(null)

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !user.isActive })
      })

      if (!response.ok) {
        throw new Error('Impossibile aggiornare lo stato.')
      }

      const updated = (await response.json()) as User
      setUsers((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossibile aggiornare lo stato.'
      )
    } finally {
      setActionId(null)
      setOpenMenuId((current) => (current == user.id ? null : current))
    }
  }

  const makeColumns = React.useCallback(
    (variant: 'default' | 'destructive', label: string) => {
      const columns: ColumnDef<User>[] = [
        {
          accessorKey: 'lastName',
          header: ({ column }) => (
            <Button
              variant='ghost'
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
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
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Nome
              <ArrowUpDown className='ml-2 h-4 w-4' />
            </Button>
          ),
          cell: ({ row }) => row.original.firstName
        },
        {
          id: 'class',
          accessorFn: (row) => `${row.year ?? ''}${getSectionLabel(row)}`,
          header: ({ column }) => (
            <Button
              variant='ghost'
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
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
          header: ({ column }) => (
            <Button
              variant='ghost'
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            >
              Crediti
              <ArrowUpDown className='ml-2 h-4 w-4' />
            </Button>
          ),
          cell: ({ row }) => row.original.lessonTokens ?? '-'
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
                <Button variant='ghost' size='icon' aria-label='Azioni'>
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
    },
    [actionId, getSectionLabel, handleToggleActive]
  )

  const inactiveColumns = React.useMemo(
    () => makeColumns('default', 'Attiva'),
    [makeColumns]
  )
  const activeColumns = React.useMemo(
    () => makeColumns('destructive', 'Disattiva'),
    [makeColumns]
  )

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
          <div className='mt-8 space-y-10'>
            <section>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold'>Studenti non attivi</h2>
                <span className='text-sm text-muted-foreground'>
                  {inactiveStudents.length}
                </span>
              </div>
              <div className='mt-4'>
                <DataTable
                  data={inactiveStudents}
                  columns={inactiveColumns}
                  searchPlaceholder='Cerca studente'
                  globalFilterFn={globalFilterFn}
                  isLoading={isLoading}
                  emptyMessage='Nessuno studente in attesa.'
                  searchKey='inactiveSearch'
                  sortKey='inactiveSort'
                />
              </div>
            </section>
            <section>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold'>Studenti attivi</h2>
                <span className='text-sm text-muted-foreground'>
                  {activeStudents.length}
                </span>
              </div>
              <div className='mt-4'>
                <DataTable
                  data={activeStudents}
                  columns={activeColumns}
                  searchPlaceholder='Cerca studente'
                  globalFilterFn={globalFilterFn}
                  isLoading={isLoading}
                  emptyMessage='Nessuno studente attivo.'
                  searchKey='activeSearch'
                  sortKey='activeSort'
                />
              </div>
            </section>
            {error && <p className='text-sm text-destructive'>{error}</p>}
          </div>
        </div>
      </div>
    </main>
  )
}
