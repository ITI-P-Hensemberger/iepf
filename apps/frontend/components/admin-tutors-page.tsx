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
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, jsonBody } from '@/lib/api-fetch'

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

const SORTABLE = ['lastName', 'firstName', 'year', 'email', 'createdAt', 'expiresAt'] as const

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

// A list's request: role filters, then the search, sort and page from the URL.
function listQuery(filters: TableFilters & { page: number }, base: Record<string, string> = {}) {
  const params = new URLSearchParams(base)
  if (filters.search.trim()) params.set('q', filters.search.trim())
  params.set('sortBy', filters.sortBy)
  params.set('sortDir', filters.sortDir)
  params.set('limit', String(pageSize))
  params.set('offset', String((filters.page - 1) * pageSize))
  return params.toString()
}

// Stable while nothing has loaded, so the tables do not rebuild on every render.
const noTutors: Tutor[] = []
const noInvites: PendingInvite[] = []

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
  const [inviteToDelete, setInviteToDelete] =
    React.useState<PendingInvite | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)
  const [showInviteDialog, setShowInviteDialog] = React.useState(false)
  const [inviteEmails, setInviteEmails] = React.useState('')
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

  const queryClient = useQueryClient()
  const activeQuery = listQuery(currentActiveFilters, { role: 'tutor', isActive: 'true' })
  const inactiveQuery = listQuery(currentInactiveFilters, { role: 'tutor', isActive: 'false' })
  const pendingQuery = listQuery(currentPendingFilters)
  // The rows stay in place while the next page or search loads.
  const activeResult = useQuery({
    queryKey: ['users', activeQuery],
    queryFn: async () => normalizePaged<Tutor>(await apiFetch(`/api/users?${activeQuery}`, 'Impossibile caricare i tutor.')),
    placeholderData: keepPreviousData
  })
  const inactiveResult = useQuery({
    queryKey: ['users', inactiveQuery],
    queryFn: async () => normalizePaged<Tutor>(await apiFetch(`/api/users?${inactiveQuery}`, 'Impossibile caricare i tutor.')),
    placeholderData: keepPreviousData
  })
  const pendingResult = useQuery({
    queryKey: ['tutor-invites', pendingQuery],
    queryFn: async () => normalizePaged<PendingInvite>(await apiFetch(`/api/auth/tutor-invite?${pendingQuery}`, 'Impossibile caricare gli inviti.')),
    placeholderData: keepPreviousData
  })
  const activeTutors = activeResult.data?.items ?? noTutors
  const activeTotal = activeResult.data?.total ?? 0
  const activeLoading = activeResult.isFetching
  const inactiveTutors = inactiveResult.data?.items ?? noTutors
  const inactiveTotal = inactiveResult.data?.total ?? 0
  const inactiveLoading = inactiveResult.isFetching
  const pendingInvites = pendingResult.data?.items ?? noInvites
  const pendingTotal = pendingResult.data?.total ?? 0
  const pendingLoading = pendingResult.isFetching

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

  // Each address on its own: one failure does not stop the others, and the dialog stays open
  // with the addresses to retry.
  const inviteTutors = useMutation({
    mutationFn: async (emails: string[]) => {
      const results = await Promise.allSettled(emails.map((email) =>
        apiFetch('/api/auth/tutor-invite/request', 'Richiesta non riuscita.', jsonBody('POST', { email }))
      ))
      return results.map((result, index) => ({
        email: emails[index],
        error: result.status === 'rejected' ? (result.reason as Error).message : null
      }))
    },
    onSuccess: (results) => {
      const sent = results.filter((result) => !result.error).length
      const failureList = results
        .filter((result) => result.error)
        .map(({ email, error }) => `• ${email}: ${error}`)
        .join('\n')
      if (sent > 0) void queryClient.invalidateQueries({ queryKey: ['tutor-invites'] })
      if (sent === results.length) {
        toast.success(`${sent} ${sent === 1 ? 'invito inviato' : 'inviti inviati'}.`)
        setInviteEmails('')
        setShowInviteDialog(false)
      } else if (sent > 0) {
        const failed = results.length - sent
        toast.error(`${sent} ${sent === 1 ? 'invito inviato' : 'inviti inviati'}.\n${failed} ${failed === 1 ? 'fallito' : 'falliti'}:\n${failureList}`)
      } else {
        toast.error(`Tutti gli inviti sono falliti:\n${failureList}`)
      }
    }
  })
  const isInviting = inviteTutors.isPending

  const handleInviteTutor = () => {
    const { valid, invalid } = parseAndValidateEmails(inviteEmails)
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
    inviteTutors.mutate(valid)
  }

  const deleteInvite = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/auth/tutor-invite/${id}`, "Impossibile eliminare l'invito.", jsonBody('DELETE')),
    onSuccess: () => {
      toast.success('Invito eliminato.')
      setShowDeleteDialog(false)
      setInviteToDelete(null)
      return queryClient.invalidateQueries({ queryKey: ['tutor-invites'] })
    }
  })
  const pendingDeletingId = deleteInvite.isPending ? deleteInvite.variables : null

  const handleDeleteInvite = () => {
    if (inviteToDelete) deleteInvite.mutate(inviteToDelete.id)
  }

  const openDeleteDialog = React.useCallback((invite: PendingInvite) => {
    setInviteToDelete(invite)
    setShowDeleteDialog(true)
  }, [])

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
                    updateParams({ searchKey: 'activeTutorSearch', sortKey: 'activeTutorSort', pageKey: 'activeTutorPage' }, activeFilters, 1)
                  }}
                  search={{
                    id: 'active-tutor-search',
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
                      updateParams({ searchKey: 'activeTutorSearch', sortKey: 'activeTutorSort', pageKey: 'activeTutorPage' }, next, 1)
                    }}
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
                    updateParams({ searchKey: 'inactiveTutorSearch', sortKey: 'inactiveTutorSort', pageKey: 'inactiveTutorPage' }, inactiveFilters, 1)
                  }}
                  search={{
                    id: 'inactive-tutor-search',
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
                      updateParams({ searchKey: 'inactiveTutorSearch', sortKey: 'inactiveTutorSort', pageKey: 'inactiveTutorPage' }, next, 1)
                    }}
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
                      updateParams({ searchKey: 'pendingTutorSearch', sortKey: 'pendingTutorSort', pageKey: 'pendingTutorPage' }, pendingFilters, 1)
                    }}
                    search={{
                      id: 'pending-tutor-search',
                      value: pendingFilters.search,
                      onChange: (value) => setPendingFilters((prev) => ({ ...prev, search: value })),
                      placeholder: 'Email'
                    }}
                  />
                  <div className='mt-6'>
                    <DataTable
                      sortable={SORTABLE}
                      sort={{ sortBy: currentPendingFilters.sortBy, sortDir: currentPendingFilters.sortDir }}
                      onSort={(key) => {
                        const next = { ...pendingFilters, ...nextSort(currentPendingFilters, key) }
                        setPendingFilters(next)
                        updateParams({ searchKey: 'pendingTutorSearch', sortKey: 'pendingTutorSort', pageKey: 'pendingTutorPage' }, next, 1)
                      }}
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
                handleInviteTutor()
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
              onClick={handleDeleteInvite}
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
