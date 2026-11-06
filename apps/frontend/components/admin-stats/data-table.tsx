'use client'

import type * as React from 'react'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type SortDir = 'asc' | 'desc'

export type StatsColumn<T> = {
  key: string
  header: string
  // The backend's sortBy value; columns without it are not sortable.
  sortKey?: string
  numeric?: boolean
  cell: (row: T) => React.ReactNode
}

type DataTableProps<T> = {
  rows: T[]
  rowKey: (row: T, index: number) => string
  columns: StatsColumn<T>[]
  isLoading: boolean
  emptyMessage: string
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  sort?: { sortBy: string, sortDir: SortDir }
  onSort?: (sortKey: string) => void
}

function SortIcon({ active, dir }: { active: boolean, dir: SortDir }) {
  if (!active) return <ArrowUpDown className='size-3.5 opacity-40' aria-hidden />
  return dir === 'asc' ? <ArrowUp className='size-3.5' aria-hidden /> : <ArrowDown className='size-3.5' aria-hidden />
}

export function DataTable<T>({ rows, rowKey, columns, isLoading, emptyMessage, page, pageSize, total, onPageChange, sort, onSort }: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)

  return (
    <div className='space-y-3'>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader className='bg-muted/50'>
            <TableRow>
              {columns.map((column) => {
                const active = sort?.sortBy === column.sortKey
                return (
                  <TableHead
                    key={column.key}
                    className={cn(column.numeric && 'text-right')}
                    aria-sort={active ? (sort?.sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {column.sortKey && onSort
                      ? (
                          <button
                            type='button'
                            onClick={() => onSort(column.sortKey!)}
                            className={cn('inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', column.numeric && 'flex-row-reverse', active && 'text-foreground')}
                          >
                            {column.header}
                            <SortIcon active={active} dir={sort?.sortDir ?? 'asc'} />
                          </button>
                        )
                      : column.header}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody className={cn(isLoading && rows.length > 0 && 'opacity-60 transition-opacity')}>
            {rows.length === 0
              ? (
                  <TableRow>
                    <TableCell className='py-8 text-center text-muted-foreground' colSpan={columns.length}>
                      {isLoading ? 'Caricamento...' : emptyMessage}
                    </TableCell>
                  </TableRow>
                )
              : rows.map((row, index) => (
                  <TableRow key={rowKey(row, index)}>
                    {columns.map(column => (
                      <TableCell key={column.key} className={cn(column.numeric && 'text-right tabular-nums')}>{column.cell(row)}</TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      <div className='flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
        <span className='tabular-nums'>{total === 0 ? 'Nessun risultato' : `${first}–${last} di ${total}`}</span>
        {totalPages > 1 && (
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='sm' onClick={() => onPageChange(page - 1)} disabled={page <= 1 || isLoading}>Precedente</Button>
            <span className='tabular-nums'>{page} / {totalPages}</span>
            <Button variant='outline' size='sm' onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || isLoading}>Successiva</Button>
          </div>
        )}
      </div>
    </div>
  )
}
