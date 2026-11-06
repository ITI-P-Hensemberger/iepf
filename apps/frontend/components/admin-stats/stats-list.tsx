'use client'

import type { ColumnDef } from '@tanstack/react-table'

import { Search } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'

import { DataTable } from '@/components/admin-stats/data-table'
import { normalizePaged } from '@/components/admin-stats/csv'
import { useJson } from '@/components/admin-stats/use-json'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PAGE_SIZE = 20

type SortDir = 'asc' | 'desc'
type Filters = { search: string, sortBy: string, sortDir: SortDir }

export type StatsListConfig<T> = {
  // URL keys are `${key}Search`, `${key}Sort` and `${key}Page`, so links keep working.
  key: string
  title: string
  endpoint: string
  extraParams?: Record<string, string>
  searchPlaceholder: string
  sortOptions: Array<{ value: string, label: string }>
  defaultSort: { sortBy: string, sortDir: SortDir }
  columns: ColumnDef<T>[]
  emptyMessage: string
  errorMessage: string
}

const SORT_DIRS = [
  { value: 'asc', label: 'Crescente' },
  { value: 'desc', label: 'Decrescente' }
]

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

  const [sortBy, sortDirRaw] = (searchParams.get(`${key}Sort`) ?? '').split(':')
  const applied: Filters = {
    search: searchParams.get(`${key}Search`) ?? '',
    sortBy: sortBy || defaultSort.sortBy,
    sortDir: sortBy ? (sortDirRaw === 'desc' ? 'desc' : 'asc') : defaultSort.sortDir
  }
  const pageParam = Math.floor(Number(searchParams.get(`${key}Page`)))
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1

  const params = new URLSearchParams(config.extraParams)
  if (applied.search.trim()) params.set('q', applied.search.trim())
  params.set('sortBy', applied.sortBy)
  params.set('sortDir', applied.sortDir)
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String((page - 1) * PAGE_SIZE))
  const { data, loading } = useJson<unknown>(`${config.endpoint}?${params.toString()}`, config.errorMessage)
  const { items, total } = normalizePaged<T>(data)

  const apply = (filters: Filters) => update({
    [`${key}Search`]: filters.search || null,
    [`${key}Sort`]: `${filters.sortBy}:${filters.sortDir}`,
    [`${key}Page`]: null
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Keyed by the applied filters: the form starts again from the URL when it changes. */}
        <FilterForm
          key={`${applied.search}|${applied.sortBy}|${applied.sortDir}`}
          id={key}
          initial={applied}
          placeholder={config.searchPlaceholder}
          sortOptions={config.sortOptions}
          onApply={apply}
          onReset={() => apply({ search: '', ...defaultSort })}
        />
        <DataTable
          data={items}
          columns={config.columns}
          isLoading={loading}
          emptyMessage={config.emptyMessage}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={next => update({ [`${key}Page`]: next > 1 ? String(next) : null })}
        />
      </CardContent>
    </Card>
  )
}

type FilterFormProps = {
  id: string
  initial: Filters
  placeholder: string
  sortOptions: StatsListConfig<unknown>['sortOptions']
  onApply: (filters: Filters) => void
  onReset: () => void
}

function FilterForm({ id, initial, placeholder, sortOptions, onApply, onReset }: FilterFormProps) {
  const [draft, setDraft] = React.useState(initial)
  return (
    <form
      className='rounded-lg border bg-card p-4 shadow-sm'
      onSubmit={(event) => {
        event.preventDefault()
        onApply(draft)
      }}
    >
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Field className='gap-2 lg:col-span-2'>
          <FieldLabel htmlFor={`${id}-search`}>Cerca</FieldLabel>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              id={`${id}-search`}
              type='search'
              placeholder={placeholder}
              value={draft.search}
              onChange={event => setDraft(prev => ({ ...prev, search: event.target.value }))}
              className='pl-9'
            />
          </div>
        </Field>
        <Field className='gap-2'>
          <FieldLabel>Ordina per</FieldLabel>
          <Select value={draft.sortBy} onValueChange={value => setDraft(prev => ({ ...prev, sortBy: value }))}>
            <SelectTrigger className='w-full'>
              <SelectValue placeholder='Ordinamento' />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className='gap-2'>
          <FieldLabel>Direzione</FieldLabel>
          <Select value={draft.sortDir} onValueChange={value => setDraft(prev => ({ ...prev, sortDir: value === 'desc' ? 'desc' : 'asc' }))}>
            <SelectTrigger className='w-full'>
              <SelectValue placeholder='Direzione' />
            </SelectTrigger>
            <SelectContent>
              {SORT_DIRS.map(option => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className='mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end'>
        <Button variant='outline' type='button' onClick={onReset}>Reset filtri</Button>
        <Button type='submit'>Applica filtri</Button>
      </div>
    </form>
  )
}
