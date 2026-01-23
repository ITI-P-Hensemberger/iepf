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
import { toast } from 'sonner'

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
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatItalianDate } from '@/lib/format-date'

type Admin = {
  id: string
  email: string
  firstName: string
  lastName: string
  role?: string | null
  isActive?: boolean | null
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
    const pageChanged =
      page > 1 ? currentPage !== String(page) : currentPage !== ''

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

export default function AdminAdminsPage() {
  const searchParams = useSearchParams()
  const [activeAdmins, setActiveAdmins] = React.useState<Admin[]>([])
  const [inactiveAdmins, setInactiveAdmins] = React.useState<Admin[]>([])
  const [pendingInvites, setPendingInvites] = React.useState<PendingInvite[]>(
    []
  )
  const [activeTotal, setActiveTotal] = React.useState(0)
  const [inactiveTotal, setInactiveTotal] = React.useState(0)
  const [pendingTotal, setPendingTotal] = React.useState(0)
  const [activeLoading, setActiveLoading] = React.useState(true)
  const [inactiveLoading, setInactiveLoading] = React.useState(true)
  const [pendingLoading, setPendingLoading] = React.useState(true)
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null)
  const [showInviteDialog, setShowInviteDialog] = React.useState(false)
  const [inviteEmails, setInviteEmails] = React.useState('')
  const [isInviting, setIsInviting] = React.useState(false)
  const pageSize = 15

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

  const loadAdmins = React.useCallback(
    async (options: {
      isActive: boolean
      search: string
      sort: { sortBy: string; sortDir: 'asc' | 'desc' } | null
      page: number
    }) => {
      const { isActive, search, sort, page } = options
      const params = new URLSearchParams()
      params.set('role', 'admin')
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
      } else {
        setInactiveLoading(true)
      }

      try {
        const response = await fetch(`/api/users?${params.toString()}`)
        if (!response.ok) {
          throw new Error('Impossibile caricare gli admin.')
        }
        const payload = await response.json()
        const { items, total } = normalizePaged<Admin>(payload)
        if (isActive) {
          setActiveAdmins(items)
          setActiveTotal(total)
        } else {
          setInactiveAdmins(items)
          setInactiveTotal(total)
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Impossibile caricare gli admin.'
        toast.error(message)
      } finally {
        if (isActive) {
          setActiveLoading(false)
        } else {
          setInactiveLoading(false)
        }
      }
    },
    [pageSize]
  )

  const loadPendingInvites = React.useCallback(
    async (options: {
      search: string
      sort: { sortBy: string; sortDir: 'asc' | 'desc' } | null
      page: number
    }) => {
      const { search, sort, page } = options
      const params = new URLSearchParams()
      if (search) {
        params.set('q', search)
      }
      if (sort) {
        params.set('sortBy', sort.sortBy)
        params.set('sortDir', sort.sortDir)
      }
      params.set('limit', String(pageSize))
      params.set('offset', String((page - 1) * pageSize))

      setPendingLoading(true)
      try {
        const response = await fetch(`/api/auth/admin-invite?${params}`)
        if (!response.ok) {
          throw new Error('Impossibile caricare gli inviti.')
        }
        const payload = await response.json()
        const { items, total } = normalizePaged<PendingInvite>(payload)
        setPendingInvites(items)
        setPendingTotal(total)
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare gli inviti.'
        )
      } finally {
        setPendingLoading(false)
      }
    },
    [pageSize]
  )

  const parseAndValidateEmails = React.useCallback(
    (
      text: string
    ): {
      valid: string[]
      invalid: Array<{ email: string; reason: string }>
    } => {
      const lines = text.split('\n')
      const valid: string[] = []
      const invalid: Array<{ email: string; reason: string }> = []

      for (const line of lines) {
        const trimmed = line.trim().toLowerCase()

        // Skip empty lines
        if (!trimmed) continue

        // Basic email format check (contains @ and .)
        if (!trimmed.includes('@') || !trimmed.includes('.')) {
          invalid.push({ email: trimmed, reason: 'Formato email non valido' })
          continue
        }

        // Domain validation
        if (!trimmed.endsWith('@itismonza.it')) {
          invalid.push({
            email: trimmed,
            reason: 'Deve essere una mail @itismonza.it'
          })
          continue
        }

        // Check for duplicates in the input
        if (valid.includes(trimmed)) {
          invalid.push({ email: trimmed, reason: 'Email duplicata' })
          continue
        }

        valid.push(trimmed)
      }

      return { valid, invalid }
    },
    []
  )

  async function handleInviteAdmin() {
    // Parse and validate emails
    const { valid, invalid } = parseAndValidateEmails(inviteEmails)

    // Check if any emails were provided
    if (valid.length === 0 && invalid.length === 0) {
      toast.error('Inserisci almeno un indirizzo email.')
      return
    }

    // Block submission if any invalid emails
    if (invalid.length > 0) {
      const errorList = invalid
        .map(({ email, reason }) => `• ${email}: ${reason}`)
        .join('\n')
      toast.error(
        `${invalid.length} email ${invalid.length === 1 ? 'non valida' : 'non valide'}:\n${errorList}`
      )
      return
    }

    setIsInviting(true)

    try {
      // Send all invites in parallel
      const results = await Promise.allSettled(
        valid.map((email) =>
          fetch('/api/auth/admin-invite/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          }).then(async (res) => {
            if (!res.ok) {
              const payload = await res.json()
              throw new Error(payload.message || 'Richiesta non riuscita.')
            }
            return { email, success: true }
          })
        )
      )

      // Collect successes and failures
      const successes: string[] = []
      const failures: Array<{ email: string; error: string }> = []

      results.forEach((result, index) => {
        const email = valid[index]
        if (result.status === 'fulfilled') {
          successes.push(email)
        } else {
          failures.push({
            email,
            error: result.reason?.message || 'Errore sconosciuto'
          })
        }
      })

      // Build feedback message
      if (successes.length === valid.length) {
        // All succeeded
        toast.success(
          `${successes.length} ${successes.length === 1 ? 'invito inviato' : 'inviti inviati'} con successo.`
        )
        setInviteEmails('')
        setShowInviteDialog(false)
        void loadPendingInvites({
          search: pendingSearch,
          sort: pendingSort,
          page: pendingPage
        })
      } else if (successes.length > 0) {
        // Partial success
        const failureList = failures
          .map(({ email, error }) => `• ${email}: ${error}`)
          .join('\n')
        toast.error(
          `${successes.length} ${successes.length === 1 ? 'invito inviato' : 'inviti inviati'} con successo.\n${failures.length} ${failures.length === 1 ? 'fallito' : 'falliti'}:\n${failureList}`
        )
        // Don't close dialog, let admin retry failed ones
      } else {
        // All failed
        const failureList = failures
          .map(({ email, error }) => `• ${email}: ${error}`)
          .join('\n')
        toast.error(`Tutti gli inviti sono falliti:\n${failureList}`)
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Si è verificato un errore. Riprova.'
      )
    } finally {
      setIsInviting(false)
    }
  }

  const makeColumns = React.useCallback(() => {
    const columns: ColumnDef<Admin>[] = [
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
                <Link href={`/admin/admins/${row.original.id}`}>Dettagli</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    ]

    return columns
  }, [openMenuId])

  const activeColumns = React.useMemo(() => makeColumns(), [makeColumns])

  const pendingColumns = React.useMemo<ColumnDef<PendingInvite>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Email',
        enableSorting: false
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
        cell: ({ row }) => formatItalianDate(row.original.createdAt)
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
        cell: ({ row }) => formatItalianDate(row.original.expiresAt)
      }
    ],
    []
  )

  const activeSearch = searchParams.get('activeAdminSearch') ?? ''
  const inactiveSearch = searchParams.get('inactiveAdminSearch') ?? ''
  const pendingSearch = searchParams.get('pendingAdminSearch') ?? ''
  const activeSortParam = searchParams.get('activeAdminSort') ?? ''
  const inactiveSortParam = searchParams.get('inactiveAdminSort') ?? ''
  const pendingSortParam = searchParams.get('pendingAdminSort') ?? ''
  const activeSort = React.useMemo(
    () => parseSortParam(activeSortParam),
    [activeSortParam, parseSortParam]
  )
  const inactiveSort = React.useMemo(
    () => parseSortParam(inactiveSortParam),
    [inactiveSortParam, parseSortParam]
  )
  const pendingSort = React.useMemo(
    () => parseSortParam(pendingSortParam),
    [pendingSortParam, parseSortParam]
  )
  const activePage = parsePage('activeAdminPage')
  const inactivePage = parsePage('inactiveAdminPage')
  const pendingPage = parsePage('pendingAdminPage')

  React.useEffect(() => {
    void loadAdmins({
      isActive: true,
      search: activeSearch,
      sort: activeSort,
      page: activePage
    })
  }, [activePage, activeSearch, activeSort, loadAdmins])

  React.useEffect(() => {
    void loadAdmins({
      isActive: false,
      search: inactiveSearch,
      sort: inactiveSort,
      page: inactivePage
    })
  }, [inactivePage, inactiveSearch, inactiveSort, loadAdmins])

  React.useEffect(() => {
    void loadPendingInvites({
      search: pendingSearch,
      sort: pendingSort,
      page: pendingPage
    })
  }, [loadPendingInvites, pendingPage, pendingSearch, pendingSort])

  const showPendingTab =
    pendingTotal > 0 ||
    Boolean(pendingSearch) ||
    Boolean(pendingSort) ||
    pendingPage > 1

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <h1 className='text-2xl'>Gestione admin</h1>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <Button
                variant='outline'
                onClick={() => setShowInviteDialog(true)}
              >
                Invita admin
              </Button>
              <Button asChild variant='outline'>
                <Link href='/admin'>Torna al pannello</Link>
              </Button>
            </div>
          </div>
          <div className='mt-8 space-y-6'>
            <Tabs defaultValue='active'>
              <TabsList>
                <TabsTrigger value='active'>Attivi ({activeTotal})</TabsTrigger>
                <TabsTrigger value='inactive'>
                  Inattivi ({inactiveTotal})
                </TabsTrigger>
                {showPendingTab && (
                  <TabsTrigger value='invites'>
                    Inviti ({pendingTotal})
                  </TabsTrigger>
                )}
              </TabsList>
              <TabsContent value='active' className='mt-6'>
                <DataTable
                  data={activeAdmins}
                  columns={activeColumns}
                  searchPlaceholder='Cerca admin'
                  isLoading={activeLoading}
                  emptyMessage='Nessun admin attivo.'
                  searchKey='activeAdminSearch'
                  sortKey='activeAdminSort'
                  pageKey='activeAdminPage'
                  page={activePage}
                  pageSize={pageSize}
                  total={activeTotal}
                />
              </TabsContent>
              <TabsContent value='inactive' className='mt-6'>
                <DataTable
                  data={inactiveAdmins}
                  columns={activeColumns}
                  searchPlaceholder='Cerca admin'
                  isLoading={inactiveLoading}
                  emptyMessage='Nessun admin non attivo.'
                  searchKey='inactiveAdminSearch'
                  sortKey='inactiveAdminSort'
                  pageKey='inactiveAdminPage'
                  page={inactivePage}
                  pageSize={pageSize}
                  total={inactiveTotal}
                />
              </TabsContent>
              {showPendingTab && (
                <TabsContent value='invites' className='mt-6'>
                  <DataTable
                    data={pendingInvites}
                    columns={pendingColumns}
                    searchPlaceholder='Cerca inviti'
                    isLoading={pendingLoading}
                    emptyMessage='Nessun invito in attesa.'
                    searchKey='pendingAdminSearch'
                    sortKey='pendingAdminSort'
                    pageKey='pendingAdminPage'
                    page={pendingPage}
                    pageSize={pageSize}
                    total={pendingTotal}
                  />
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </div>

      <AlertDialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invita admin</AlertDialogTitle>
            <AlertDialogDescription>
              Inserisci gli indirizzi email istituzionali degli admin, uno per
              riga. <br />
              Verranno inviati gli inviti alla registrazione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-3'>
            {/* Email count indicator */}
            {inviteEmails.trim() && (
              <div className='text-sm text-muted-foreground'>
                {(() => {
                  const { valid, invalid } =
                    parseAndValidateEmails(inviteEmails)
                  if (valid.length > 0) {
                    return `${valid.length} email ${valid.length === 1 ? 'valida' : 'valide'} ${invalid.length > 0 ? `(${invalid.length} non ${invalid.length === 1 ? 'valida' : 'valide'})` : ''}`
                  }
                  return invalid.length > 0
                    ? `${invalid.length} email non ${invalid.length === 1 ? 'valida' : 'valide'}`
                    : null
                })()}
              </div>
            )}

            <Textarea
              placeholder='admin1@itismonza.it'
              value={inviteEmails}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setInviteEmails(event.target.value)
              }
              rows={6}
              className='font-mono text-sm'
            />

          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setInviteEmails('')
              }}
            >
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleInviteAdmin()
              }}
              disabled={isInviting || !inviteEmails.trim()}
            >
              {isInviting ? 'Invio...' : 'Invia inviti'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
