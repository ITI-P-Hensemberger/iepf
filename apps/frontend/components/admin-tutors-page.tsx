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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
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

type Tutor = {
  id: string
  email: string
  firstName: string
  lastName: string
  role?: string | null
  sectionId?: string | null
  year?: number | null
  isActive?: boolean | null
}

type Section = {
  id: string
  name: string
}

type PendingInvite = {
  email: string
  createdAt: string
  expiresAt: string
}

type DataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData>[]
  searchPlaceholder: string
  globalFilterFn: FilterFn<TData>
  isLoading: boolean
  emptyMessage: string
  searchKey: string
  sortKey: string
}

function DataTable<TData>({
  data,
  columns,
  searchPlaceholder,
  globalFilterFn,
  isLoading,
  emptyMessage,
  searchKey,
  sortKey
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

export default function AdminTutorsPage() {
  const [tutors, setTutors] = React.useState<Tutor[]>([])
  const [pendingInvites, setPendingInvites] = React.useState<PendingInvite[]>(
    []
  )
  const [isLoading, setIsLoading] = React.useState(true)
  const [isPendingLoading, setIsPendingLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [pendingError, setPendingError] = React.useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null)
  const [sectionMap, setSectionMap] = React.useState<Map<string, string>>(
    () => new Map()
  )
  const [showInviteDialog, setShowInviteDialog] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState('')
  const [inviteError, setInviteError] = React.useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = React.useState<string | null>(null)
  const [isInviting, setIsInviting] = React.useState(false)

  const fetchPendingInvites = React.useCallback(async () => {
    setIsPendingLoading(true)
    setPendingError(null)

    try {
      const response = await fetch('/api/auth/tutor-invite')
      if (!response.ok) {
        throw new Error('Impossibile caricare gli inviti.')
      }
      const data = (await response.json()) as PendingInvite[]
      setPendingInvites(data)
    } catch (err) {
      setPendingError(
        err instanceof Error ? err.message : 'Impossibile caricare gli inviti.'
      )
    } finally {
      setIsPendingLoading(false)
    }
  }, [])

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

    async function loadTutors() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/users')
        if (!response.ok) {
          throw new Error('Impossibile caricare i tutor.')
        }
        const data = (await response.json()) as Tutor[]
        if (isMounted) {
          setTutors(data.filter((user) => user.role === 'tutor'))
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'Impossibile caricare i tutor.'
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadSections()
    void loadTutors()
    void fetchPendingInvites()

    return () => {
      isMounted = false
    }
  }, [fetchPendingInvites])

  const getSectionLabel = React.useCallback(
    (tutor: Tutor) => {
      if (!tutor.sectionId) {
        return '-'
      }
      return sectionMap.get(tutor.sectionId) ?? tutor.sectionId
    },
    [sectionMap]
  )

  const globalFilterFn: FilterFn<Tutor> = React.useCallback(
    (row, _columnId, value) => {
      const query = String(value ?? '')
        .toLowerCase()
        .trim()
      if (!query) {
        return true
      }
      const tutor = row.original
      const classLabel = `${tutor.year ?? ''}${getSectionLabel(tutor)}`
      const haystack =
        `${tutor.firstName ?? ''} ${tutor.lastName ?? ''} ${tutor.email ?? ''} ${classLabel}`.toLowerCase()
      return haystack.includes(query)
    },
    [getSectionLabel]
  )

  const sortByLastName = (list: Tutor[]) =>
    [...list].sort((a, b) =>
      a.lastName.localeCompare(b.lastName, 'it', { sensitivity: 'base' })
    )

  const activeTutors = sortByLastName(tutors.filter((user) => user.isActive))
  const inactiveTutors = sortByLastName(
    tutors.filter((user) => !user.isActive)
  )

  const pendingFilterFn: FilterFn<PendingInvite> = React.useCallback(
    (row, _columnId, value) => {
      const query = String(value ?? '')
        .toLowerCase()
        .trim()
      if (!query) {
        return true
      }
      return row.original.email.toLowerCase().includes(query)
    },
    []
  )

  const formatDate = React.useCallback((value?: string) => {
    if (!value) {
      return '-'
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return value
    }
    return new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(parsed)
  }, [])

  async function handleInviteTutor() {
    const normalized = inviteEmail.trim().toLowerCase()

    if (!normalized) {
      setInviteError('Inserisci un indirizzo email valido.')
      return
    }

    if (!normalized.endsWith('@itismonza.it')) {
      setInviteError('Utilizza una mail @itismonza.it')
      return
    }

    setIsInviting(true)
    setInviteError(null)

    try {
      const response = await fetch('/api/auth/tutor-invite/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: normalized })
      })

      if (!response.ok) {
        let message = "Impossibile inviare l'invito."
        try {
          const payload = (await response.json()) as { message?: string }
          message = payload.message ?? message
        } catch (err) {
          message = "Impossibile inviare l'invito."
        }
        throw new Error(message)
      }

      setInviteSuccess(`Invito inviato a ${normalized}.`)
      setInviteEmail('')
      setShowInviteDialog(false)
      void fetchPendingInvites()
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Impossibile inviare l'invito."
      )
    } finally {
      setIsInviting(false)
    }
  }

  const makeColumns = React.useCallback(() => {
    const columns: ColumnDef<Tutor>[] = [
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
        id: 'class',
        accessorFn: (row) => `${row.year ?? ''}${getSectionLabel(row)}`,
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
                <Link href={`/admin/tutors/${row.original.id}`}>Dettagli</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    ]

    return columns
  }, [getSectionLabel, openMenuId])

  const activeColumns = React.useMemo(() => makeColumns(), [makeColumns])

  const pendingColumns = React.useMemo<ColumnDef<PendingInvite>[]>(
    () => [
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <Button
            variant='ghost'
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Email
            <ArrowUpDown className='ml-2 h-4 w-4' />
          </Button>
        )
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <Button
            variant='ghost'
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Invitato il
            <ArrowUpDown className='ml-2 h-4 w-4' />
          </Button>
        ),
        cell: ({ row }) => formatDate(row.original.createdAt)
      },
      {
        accessorKey: 'expiresAt',
        header: ({ column }) => (
          <Button
            variant='ghost'
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Scade il
            <ArrowUpDown className='ml-2 h-4 w-4' />
          </Button>
        ),
        cell: ({ row }) => formatDate(row.original.expiresAt)
      }
    ],
    [formatDate]
  )

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Gestione tutor</h1>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <Button
                variant='outline'
                onClick={() => setShowInviteDialog(true)}
              >
                Invita tutor
              </Button>
              <Button asChild variant='outline'>
                <Link href='/admin'>Torna al pannello</Link>
              </Button>
            </div>
          </div>
          <div className='mt-8 space-y-10'>
            <section>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold'>Tutor invitati</h2>
                <span className='text-sm text-muted-foreground'>
                  {pendingInvites.length}
                </span>
              </div>
              <div className='mt-4'>
                <DataTable
                  data={pendingInvites}
                  columns={pendingColumns}
                  searchPlaceholder='Cerca inviti'
                  globalFilterFn={pendingFilterFn}
                  isLoading={isPendingLoading}
                  emptyMessage='Nessun invito in attesa.'
                  searchKey='pendingTutorSearch'
                  sortKey='pendingTutorSort'
                />
                {pendingError && (
                  <p className='mt-3 text-sm text-destructive'>
                    {pendingError}
                  </p>
                )}
              </div>
            </section>
            <section>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold'>Tutor attivi</h2>
                <span className='text-sm text-muted-foreground'>
                  {activeTutors.length}
                </span>
              </div>
              <div className='mt-4'>
                <DataTable
                  data={activeTutors}
                  columns={activeColumns}
                  searchPlaceholder='Cerca tutor'
                  globalFilterFn={globalFilterFn}
                  isLoading={isLoading}
                  emptyMessage='Nessun tutor attivo.'
                  searchKey='activeTutorSearch'
                  sortKey='activeTutorSort'
                />
              </div>
            </section>
            <section>
              <div className='flex items-center justify-between'>
                <h2 className='text-lg font-semibold'>Tutor non attivi</h2>
                <span className='text-sm text-muted-foreground'>
                  {inactiveTutors.length}
                </span>
              </div>
              <div className='mt-4'>
                <DataTable
                  data={inactiveTutors}
                  columns={activeColumns}
                  searchPlaceholder='Cerca tutor'
                  globalFilterFn={globalFilterFn}
                  isLoading={isLoading}
                  emptyMessage='Nessun tutor non attivo.'
                  searchKey='inactiveTutorSearch'
                  sortKey='inactiveTutorSort'
                />
              </div>
            </section>
            {inviteSuccess && (
              <p className='text-sm text-emerald-600'>{inviteSuccess}</p>
            )}
            {error && <p className='text-sm text-destructive'>{error}</p>}
          </div>
        </div>
      </div>

      <AlertDialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invita un tutor</AlertDialogTitle>
            <AlertDialogDescription>
              Inserisci l'indirizzo email istituzionale del tutor per inviare
              l'invito alla registrazione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-2'>
            <Input
              type='email'
              placeholder='nome.cognome@itismonza.it'
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              autoComplete='email'
            />
            {inviteError && (
              <p className='text-sm text-destructive'>{inviteError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setInviteError(null)
                setInviteEmail('')
              }}
            >
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleInviteTutor()
              }}
              disabled={isInviting}
            >
              {isInviting ? 'Invio...' : 'Invia invito'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
