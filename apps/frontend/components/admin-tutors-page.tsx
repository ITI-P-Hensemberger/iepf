'use client'

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
import { Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { FilterForm } from '@/components/filter-form'
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
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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
import { classLabel } from '@/lib/class-label'

const pageSize = 20

type Tutor = {
  id: string
  email: string
  firstName: string
  lastName: string
  role?: string | null
  sectionId?: string | null
  sectionName?: string | null
  year?: number | null
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

type TableFilters = {
  search: string
  sortBy: string
  sortDir: 'asc' | 'desc'
}

const defaultTutorFilters: TableFilters = {
  search: '',
  sortBy: 'lastName',
  sortDir: 'asc'
}

const defaultInviteFilters: TableFilters = {
  search: '',
  sortBy: 'createdAt',
  sortDir: 'desc'
}

export default function AdminTutorsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const setParam = useSetParam()
  // The open tab lives in the URL, so it is still open after a trip to a detail page and back.
  const listTab = (['inactive', 'invites'] as const).find((value) => value === searchParams.get('tab')) ?? 'active'
  const searchParamsString = searchParams.toString()
  const [activeTutors, setActiveTutors] = React.useState<Tutor[]>([])
  const [inactiveTutors, setInactiveTutors] = React.useState<Tutor[]>([])
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
  const [activeFilters, setActiveFilters] =
    React.useState<TableFilters>(defaultTutorFilters)
  const [inactiveFilters, setInactiveFilters] =
    React.useState<TableFilters>(defaultTutorFilters)
  const [pendingFilters, setPendingFilters] =
    React.useState<TableFilters>(defaultInviteFilters)

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
    (
      searchKey: string,
      sortKey: string,
      pageKey: string,
      defaults: TableFilters
    ) => {
      const sortParam = parseSortParam(searchParams.get(sortKey))
      return {
        search: searchParams.get(searchKey) ?? '',
        sortBy: sortParam?.sortBy ?? defaults.sortBy,
        sortDir: sortParam?.sortDir ?? defaults.sortDir,
        page: parsePage(pageKey)
      }
    },
    [parsePage, parseSortParam, searchParams]
  )

  const currentActiveFilters = React.useMemo(
    () =>
      buildFilters(
        'activeTutorSearch',
        'activeTutorSort',
        'activeTutorPage',
        defaultTutorFilters
      ),
    [buildFilters]
  )
  const currentInactiveFilters = React.useMemo(
    () =>
      buildFilters(
        'inactiveTutorSearch',
        'inactiveTutorSort',
        'inactiveTutorPage',
        defaultTutorFilters
      ),
    [buildFilters]
  )
  const currentPendingFilters = React.useMemo(
    () =>
      buildFilters(
        'pendingTutorSearch',
        'pendingTutorSort',
        'pendingTutorPage',
        defaultInviteFilters
      ),
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

  React.useEffect(() => {
    setPendingFilters((prev) => {
      const next = {
        search: currentPendingFilters.search,
        sortBy: currentPendingFilters.sortBy,
        sortDir: currentPendingFilters.sortDir
      }
      return prev.search === next.search &&
        prev.sortBy === next.sortBy &&
        prev.sortDir === next.sortDir
        ? prev
        : next
    })
  }, [
    currentPendingFilters.search,
    currentPendingFilters.sortBy,
    currentPendingFilters.sortDir
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
    setActiveFilters(defaultTutorFilters)
    updateParams(
      {
        searchKey: 'activeTutorSearch',
        sortKey: 'activeTutorSort',
        pageKey: 'activeTutorPage'
      },
      defaultTutorFilters,
      1
    )
  }, [updateParams])

  const resetInactiveFilters = React.useCallback(() => {
    setInactiveFilters(defaultTutorFilters)
    updateParams(
      {
        searchKey: 'inactiveTutorSearch',
        sortKey: 'inactiveTutorSort',
        pageKey: 'inactiveTutorPage'
      },
      defaultTutorFilters,
      1
    )
  }, [updateParams])

  const resetPendingFilters = React.useCallback(() => {
    setPendingFilters(defaultInviteFilters)
    updateParams(
      {
        searchKey: 'pendingTutorSearch',
        sortKey: 'pendingTutorSort',
        pageKey: 'pendingTutorPage'
      },
      defaultInviteFilters,
      1
    )
  }, [updateParams])

  const loadTutors = React.useCallback(
    async (options: {
      isActive: boolean
      search: string
      sort: { sortBy: string; sortDir: 'asc' | 'desc' }
      page: number
    }) => {
      const { isActive, search, sort, page } = options
      const params = new URLSearchParams()
      params.set('role', 'tutor')
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
          throw new Error('Impossibile caricare i tutor.')
        }
        const payload = await response.json()
        const { items, total } = normalizePaged<Tutor>(payload)
        if (isActive) {
          setActiveTutors(items)
          setActiveTotal(total)
        } else {
          setInactiveTutors(items)
          setInactiveTotal(total)
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Impossibile caricare i tutor.'
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

  const loadPendingInvites = React.useCallback(
    async (options: {
      search: string
      sort: { sortBy: string; sortDir: 'asc' | 'desc' }
      page: number
    }) => {
      const { search, sort, page } = options
      const params = new URLSearchParams()
      if (search) {
        params.set('q', search)
      }
      params.set('sortBy', sort.sortBy)
      params.set('sortDir', sort.sortDir)
      params.set('limit', String(pageSize))
      params.set('offset', String((page - 1) * pageSize))

      setPendingLoading(true)

      try {
        const response = await fetch(
          `/api/auth/tutor-invite?${params.toString()}`
        )
        if (!response.ok) {
          throw new Error('Impossibile caricare gli inviti.')
        }
        const payload = await response.json()
        const { items, total } = normalizePaged<PendingInvite>(payload)
        setPendingInvites(items)
        setPendingTotal(total)
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Impossibile caricare gli inviti.'
        toast.error(message)
      } finally {
        setPendingLoading(false)
      }
    },
    []
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

  const handleInviteTutor = React.useCallback(async () => {
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
          fetch('/api/auth/tutor-invite/request', {
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
          search: currentPendingFilters.search,
          sort: {
            sortBy: currentPendingFilters.sortBy,
            sortDir: currentPendingFilters.sortDir
          },
          page: currentPendingFilters.page
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
  }, [
    currentPendingFilters.page,
    currentPendingFilters.search,
    currentPendingFilters.sortBy,
    currentPendingFilters.sortDir,
    inviteEmails,
    loadPendingInvites,
    parseAndValidateEmails
  ])

  const handleDeleteInvite = React.useCallback(
    async () => {
      if (!inviteToDelete) return
      const invite = inviteToDelete
      setPendingDeletingId(invite.id)
      try {
        const response = await fetch(`/api/auth/tutor-invite/${invite.id}`, {
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
          search: currentPendingFilters.search,
          sort: {
            sortBy: currentPendingFilters.sortBy,
            sortDir: currentPendingFilters.sortDir
          },
          page: currentPendingFilters.page
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
    [
      currentPendingFilters.page,
      currentPendingFilters.search,
      currentPendingFilters.sortBy,
      currentPendingFilters.sortDir,
      inviteToDelete,
      loadPendingInvites
    ]
  )

  const openDeleteDialog = React.useCallback((invite: PendingInvite) => {
    setInviteToDelete(invite)
    setShowDeleteDialog(true)
  }, [])

  React.useEffect(() => {
    void loadTutors({
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
    loadTutors
  ])

  React.useEffect(() => {
    void loadTutors({
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
    loadTutors
  ])

  React.useEffect(() => {
    void loadPendingInvites({
      search: currentPendingFilters.search,
      sort: {
        sortBy: currentPendingFilters.sortBy,
        sortDir: currentPendingFilters.sortDir
      },
      page: currentPendingFilters.page
    })
  }, [
    currentPendingFilters.page,
    currentPendingFilters.search,
    currentPendingFilters.sortBy,
    currentPendingFilters.sortDir,
    loadPendingInvites
  ])

  const makeColumns = React.useCallback(() => {
    const columns: ColumnDef<Tutor>[] = [
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
      }
    ]

    return columns
  }, [])

  const columns = React.useMemo(() => makeColumns(), [makeColumns])

  const pendingColumns = React.useMemo<ColumnDef<PendingInvite>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Email',
        enableSorting: false
      },
      {
        accessorKey: 'createdAt',
        header: 'Invitato il',
        cell: ({ row }) => formatItalianDate(row.original.createdAt)
      },
      {
        accessorKey: 'expiresAt',
        header: 'Scade il',
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

  const showPendingTab =
    pendingTotal > 0 ||
    Boolean(searchParams.get('pendingTutorSearch')) ||
    Boolean(searchParams.get('pendingTutorSort')) ||
    parsePage('pendingTutorPage') > 1

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl'>
          <PageHeader
            title='Gestione tutor'
            backHref='/admin'
            actions={
              <Button variant='outline' onClick={() => setShowInviteDialog(true)}>
                Invita tutor
              </Button>
            }
          />
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
                <FilterForm
                  values={activeFilters}
                  applied={currentActiveFilters}
                  onSubmit={(event) => {
                    event.preventDefault()
                    updateParams(
                      {
                        searchKey: 'activeTutorSearch',
                        sortKey: 'activeTutorSort',
                        pageKey: 'activeTutorPage'
                      },
                      activeFilters,
                      1
                    )
                  }}
                >
                  <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                    <Field className='gap-2 lg:col-span-2'>
                      <FieldLabel htmlFor='active-tutor-search'>
                        Cerca
                      </FieldLabel>
                      <div className='relative'>
                        <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                        <Input
                          id='active-tutor-search'
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
                      <Button variant='ghost' size='sm' type='button' onClick={resetActiveFilters}>
                        Azzera filtri
                      </Button>
                    </div>
                  </div>
                </FilterForm>
                <div className='mt-6'>
                  <DataTable
                    data={activeTutors}
                    columns={columns}
                    rowHref={(row) => `/admin/tutors/${row.id}`}
                    isLoading={activeLoading}
                    emptyMessage='Nessun tutor attivo.'
                    pageKey='activeTutorPage'
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
                    updateParams(
                      {
                        searchKey: 'inactiveTutorSearch',
                        sortKey: 'inactiveTutorSort',
                        pageKey: 'inactiveTutorPage'
                      },
                      inactiveFilters,
                      1
                    )
                  }}
                >
                  <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                    <Field className='gap-2 lg:col-span-2'>
                      <FieldLabel htmlFor='inactive-tutor-search'>
                        Cerca
                      </FieldLabel>
                      <div className='relative'>
                        <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                        <Input
                          id='inactive-tutor-search'
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
                      <Button variant='ghost' size='sm' type='button' onClick={resetInactiveFilters}>
                        Azzera filtri
                      </Button>
                    </div>
                  </div>
                </FilterForm>
                <div className='mt-6'>
                  <DataTable
                    data={inactiveTutors}
                    columns={columns}
                    rowHref={(row) => `/admin/tutors/${row.id}`}
                    isLoading={inactiveLoading}
                    emptyMessage='Nessun tutor non attivo.'
                    pageKey='inactiveTutorPage'
                    page={currentInactiveFilters.page}
                    pageSize={pageSize}
                    total={inactiveTotal}
                  />
                </div>
              </TabsContent>
              {showPendingTab && (
                <TabsContent value='invites' className='mt-6'>
                  <FilterForm
                    values={pendingFilters}
                    applied={currentPendingFilters}
                    onSubmit={(event) => {
                      event.preventDefault()
                      updateParams(
                        {
                          searchKey: 'pendingTutorSearch',
                          sortKey: 'pendingTutorSort',
                          pageKey: 'pendingTutorPage'
                        },
                        pendingFilters,
                        1
                      )
                    }}
                  >
                    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
                      <Field className='gap-2 lg:col-span-2'>
                        <FieldLabel htmlFor='pending-tutor-search'>
                          Cerca
                        </FieldLabel>
                        <div className='relative'>
                          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                          <Input
                            id='pending-tutor-search'
                            type='search'
                            placeholder='Email'
                            value={pendingFilters.search}
                            onChange={(event) =>
                              setPendingFilters((prev) => ({
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
                          value={pendingFilters.sortBy}
                          onValueChange={(value) =>
                            setPendingFilters((prev) => ({
                              ...prev,
                              sortBy: value
                            }))
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Ordinamento' />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='createdAt'>
                              Invitato il
                            </SelectItem>
                            <SelectItem value='expiresAt'>Scade il</SelectItem>
                            <SelectItem value='email'>Email</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className='gap-2'>
                        <FieldLabel>Direzione</FieldLabel>
                        <Select
                          value={pendingFilters.sortDir}
                          onValueChange={(value) =>
                            setPendingFilters((prev) => ({
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
                        <Button variant='ghost' size='sm' type='button' onClick={resetPendingFilters}>
                        Azzera filtri
                      </Button>
                      </div>
                    </div>
                  </FilterForm>
                  <div className='mt-6'>
                    <DataTable
                      data={pendingInvites}
                      columns={pendingColumns}
                      isLoading={pendingLoading}
                      emptyMessage='Nessun invito in attesa.'
                      pageKey='pendingTutorPage'
                      page={currentPendingFilters.page}
                      pageSize={pageSize}
                      total={pendingTotal}
                    />
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </div>

      <AlertDialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invita tutor</AlertDialogTitle>
            <AlertDialogDescription>
              Inserisci gli indirizzi email istituzionali dei tutor, uno per
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
                void handleInviteTutor()
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
