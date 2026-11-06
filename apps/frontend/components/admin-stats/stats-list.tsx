'use client'

import type { SortDir, StatsColumn } from '@/components/admin-stats/data-table'

import { Search, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'

import { DataTable } from '@/components/admin-stats/data-table'
import { normalizePaged } from '@/components/admin-stats/paged'
import { useJson } from '@/components/admin-stats/use-json'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const PAGE_SIZE = 20
const SEARCH_DELAY_MS = 350

export type StatsListConfig<T> = {
  // URL keys are `${key}Search`, `${key}Sort` and `${key}Page`, so links keep working.
  key: string
  title: string
  description?: string
  endpoint: string
  extraParams?: Record<string, string>
  searchPlaceholder: string
  defaultSort: { sortBy: string, sortDir: SortDir }
  // Numbers read best largest first; names alphabetically.
  descendingFirst?: string[]
  columns: StatsColumn<T>[]
  rowKey: (row: T, index: number) => string
  emptyMessage: string
  errorMessage: string
}

function useUrlState() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const update = React.useCallback((changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])
  return { searchParams, update }
}

export function StatsList<T>({ config }: { config: StatsListConfig<T> }) {
  const { searchParams, update } = useUrlState()
  const { key, defaultSort } = config

  const search = searchParams.get(`${key}Search`) ?? ''
  const [sortParam, dirParam] = (searchParams.get(`${key}Sort`) ?? '').split(':')
  const sort = sortParam
    ? { sortBy: sortParam, sortDir: (dirParam === 'desc' ? 'desc' : 'asc') as SortDir }
    : defaultSort
  const pageParam = Math.floor(Number(searchParams.get(`${key}Page`)))
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1

  const params = new URLSearchParams(config.extraParams)
  if (search.trim()) params.set('q', search.trim())
  params.set('sortBy', sort.sortBy)
  params.set('sortDir', sort.sortDir)
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String((page - 1) * PAGE_SIZE))
  const { data, loading } = useJson<unknown>(`${config.endpoint}?${params.toString()}`, config.errorMessage)
  const { items, total } = normalizePaged<T>(data)

  const changeSort = (sortKey: string) => {
    const sortDir: SortDir = sort.sortBy === sortKey
      ? (sort.sortDir === 'asc' ? 'desc' : 'asc')
      : (config.descendingFirst?.includes(sortKey) ? 'desc' : 'asc')
    update({ [`${key}Sort`]: `${sortKey}:${sortDir}`, [`${key}Page`]: null })
  }
  const isDefault = !search && sort.sortBy === defaultSort.sortBy && sort.sortDir === defaultSort.sortDir

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-1.5'>
            <CardTitle>{config.title}</CardTitle>
            {config.description && <CardDescription>{config.description}</CardDescription>}
          </div>
          <div className='flex items-center gap-2 sm:w-80'>
            {/* Keyed by the URL value: the box starts again from it after a reset or a link. */}
            <SearchBox
              key={search}
              id={`${key}-search`}
              initial={search}
              placeholder={config.searchPlaceholder}
              onSearch={value => update({ [`${key}Search`]: value || null, [`${key}Page`]: null })}
            />
            {!isDefault && (
              <Button
                variant='ghost'
                size='icon'
                aria-label='Azzera ricerca e ordinamento'
                title='Azzera ricerca e ordinamento'
                onClick={() => update({ [`${key}Search`]: null, [`${key}Sort`]: null, [`${key}Page`]: null })}
              >
                <X className='size-4' aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          rows={items}
          rowKey={config.rowKey}
          columns={config.columns}
          isLoading={loading}
          emptyMessage={search ? `Nessun risultato per "${search}".` : config.emptyMessage}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={next => update({ [`${key}Page`]: next > 1 ? String(next) : null })}
          sort={sort}
          onSort={changeSort}
        />
      </CardContent>
    </Card>
  )
}

// Searches by itself a moment after typing stops; Enter searches at once.
function SearchBox({ id, initial, placeholder, onSearch }: { id: string, initial: string, placeholder: string, onSearch: (value: string) => void }) {
  const [value, setValue] = React.useState(initial)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const schedule = (next: string, delay: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (next.trim() !== initial.trim()) onSearch(next.trim())
    }, delay)
  }

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return (
    <div className='relative flex-1'>
      <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden />
      <Input
        id={id}
        type='search'
        aria-label='Cerca'
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          schedule(event.target.value, SEARCH_DELAY_MS)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') schedule(value, 0)
        }}
        className='pl-9'
      />
    </div>
  )
}
