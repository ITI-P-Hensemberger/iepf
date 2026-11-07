'use client'

import { SortableHead } from '@/components/sortable-head'
import { ListPagination } from '@/components/list-pagination'
import { TableSkeletonRows } from '@/components/loading'
import * as React from 'react'

import { PushInviteCard } from '@/components/push-prompt'
import { useSession } from '@/lib/use-session'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { useHere, useSetParam, withFrom } from '@/lib/back-link'
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
  id: string
  email: string
  createdAt: string
  expiresAt: string
}

type DataTableProps<TData> = {
  // Opens the row's details: the whole row is the link.
  rowHref?: (row: TData) => string
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
  rowHref,
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
  const here = useHere()
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
    }, 100)
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
      {/* The same search bar as every list: under the header while the list scrolls. */}
      <div className='sticky top-[var(--app-header-bottom)] z-30 -mx-4 bg-background/95 px-4 py-3 backdrop-blur'>
        <div className='relative'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            type='search'
            aria-label='Cerca'
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

export default function AdminAdminsPage() {
  const { profile } = useSession()
  const searchParams = useSearchParams()
  const setParam = useSetParam()
  // The open tab lives in the URL, so it is still open after a trip to a detail page and back.
  const listTab = (['inactive', 'invites'] as const).find((value) => value === searchParams.get('tab')) ?? 'active'
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
  const [pendingDeletingId, setPendingDeletingId] = React.useState<
    string | null
  >(null)
  const [inviteToDelete, setInviteToDelete] =
    React.useState<PendingInvite | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)
  const [showInviteDialog, setShowInviteDialog] = React.useState(false)
  const [inviteEmails, setInviteEmails] = React.useState('')
  const [isInviting, setIsInviting] = React.useState(false)
  const pageSize = 20

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
      if (search.trim()) {
        params.set('q', search.trim())
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
      if (search.trim()) {
        params.set('q', search.trim())
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
        if (!trimmed.endsWith('@hensemberger.it')) {
          invalid.push({
            email: trimmed,
            reason: 'Deve essere una mail @hensemberger.it'
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
          `${successes.length} ${successes.length === 1 ? 'invito inviato' : 'inviti inviati'}.`
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
          `${successes.length} ${successes.length === 1 ? 'invito inviato' : 'inviti inviati'}.\n${failures.length} ${failures.length === 1 ? 'fallito' : 'falliti'}:\n${failureList}`
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

  const handleDeleteInvite = React.useCallback(
    async () => {
      if (!inviteToDelete) return
      const invite = inviteToDelete
      setPendingDeletingId(invite.id)
      try {
        const response = await fetch(`/api/auth/admin-invite/${invite.id}`, {
          method: 'DELETE'
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(
            payload?.message || "Impossibile eliminare l'invito."
          )
        }
        toast.success('Invito eliminato.')
        void loadPendingInvites({
          search: searchParams.get('pendingAdminSearch') ?? '',
          sort: parseSortParam(searchParams.get('pendingAdminSort')),
          page: parsePage('pendingAdminPage')
        })
        setShowDeleteDialog(false)
        setInviteToDelete(null)
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Impossibile eliminare l'invito."
        )
      } finally {
        setPendingDeletingId(null)
      }
    },
    [inviteToDelete, loadPendingInvites, parsePage, parseSortParam, searchParams]
  )

  const openDeleteDialog = React.useCallback((invite: PendingInvite) => {
    setInviteToDelete(invite)
    setShowDeleteDialog(true)
  }, [])

  const makeColumns = React.useCallback(() => {
    const columns: ColumnDef<Admin>[] = [
      {
        accessorKey: 'lastName',
        header: ({ column }) => (
          <SortableHead
            label='Cognome'
            sortKey={column.id}
            sortBy={column.getIsSorted() ? column.id : ''}
            sortDir={column.getIsSorted() === 'desc' ? 'desc' : 'asc'}
            onSort={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        cell: ({ row }) => row.original.lastName
      },
      {
        accessorKey: 'firstName',
        header: ({ column }) => (
          <SortableHead
            label='Nome'
            sortKey={column.id}
            sortBy={column.getIsSorted() ? column.id : ''}
            sortDir={column.getIsSorted() === 'desc' ? 'desc' : 'asc'}
            onSort={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        cell: ({ row }) => row.original.firstName
      }
    ]

    return columns
  }, [])

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
          <SortableHead
            label='Invitato il'
            sortKey={column.id}
            sortBy={column.getIsSorted() ? column.id : ''}
            sortDir={column.getIsSorted() === 'desc' ? 'desc' : 'asc'}
            onSort={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        cell: ({ row }) => formatItalianDate(row.original.createdAt)
      },
      {
        accessorKey: 'expiresAt',
        header: ({ column }) => (
          <SortableHead
            label='Scade il'
            sortKey={column.id}
            sortBy={column.getIsSorted() ? column.id : ''}
            sortDir={column.getIsSorted() === 'desc' ? 'desc' : 'asc'}
            onSort={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          />
        ),
        cell: ({ row }) => formatItalianDate(row.original.expiresAt)
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>Azioni</span>,
        cell: ({ row }) => (
          <div className='flex items-center justify-end gap-2'>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => openDeleteDialog(row.original)}
              disabled={Boolean(pendingDeletingId)}
              aria-label='Elimina invito'
            >
              <Trash2 className='h-4 w-4 text-destructive' />
            </Button>
          </div>
        )
      }
    ],
    [openDeleteDialog, pendingDeletingId]
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
          <PageHeader
            title='Gestione admin'
            backHref='/admin'
            actions={
              <Button variant='outline' onClick={() => setShowInviteDialog(true)}>
                Invita admin
              </Button>
            }
          />
          <div className='mt-6 empty:hidden'>
            <PushInviteCard
              userId={profile?.id}
              role={profile?.role}
              title='Ti avvisiamo quando un admin chiede l’accesso'
              description='Attiva le notifiche per approvare le nuove richieste senza aspettare l’email.'
            />
          </div>
          <div className='mt-8 space-y-6'>
            <Tabs value={listTab} onValueChange={(value) => setParam('tab', value === 'active' ? null : value)}>
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
                    rowHref={(row) => `/admin/admins/${row.id}`}
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
                    rowHref={(row) => `/admin/admins/${row.id}`}
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
              placeholder='rossi.mario@hensemberger.it'
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

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open)
          if (!open) {
            setInviteToDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina invito</AlertDialogTitle>
            <AlertDialogDescription>
              {inviteToDelete
                ? `L'invito per ${inviteToDelete.email} verrà eliminato in modo permanente.`
                : "L'invito selezionato verrà eliminato in modo permanente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingDeletingId)}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteInvite()}
              disabled={Boolean(pendingDeletingId) || !inviteToDelete}
              variant='destructive'
            >
              {pendingDeletingId ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
