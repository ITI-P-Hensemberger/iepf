'use client'

import type * as React from 'react'

import { TableSkeletonRows, useFirstLoad } from '@/components/loading'
import { ListPagination } from '@/components/list-pagination'
import { SortableHead } from '@/components/sortable-head'

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

export function DataTable<T>({ rows, rowKey, columns, isLoading, emptyMessage, page, pageSize, total, onPageChange, sort, onSort }: DataTableProps<T>) {
  const firstLoad = useFirstLoad(isLoading)
  return (
    <div className='space-y-3'>
      <div className='overflow-x-auto rounded-lg border lg:overflow-visible'>
        <Table>
          <TableHeader sticky className='bg-muted/50'>
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
                          <SortableHead
                            label={column.header}
                            sortKey={column.sortKey}
                            sortBy={sort?.sortBy ?? ''}
                            sortDir={sort?.sortDir ?? 'asc'}
                            onSort={onSort}
                            className={cn(column.numeric && 'flex-row-reverse')}
                          />
                        )
                      : column.header}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody className={cn(isLoading && !firstLoad && 'opacity-60 transition-opacity')} aria-busy={isLoading}>
            {firstLoad
              ? <TableSkeletonRows columns={columns.length} />
              : rows.length === 0
              ? (
                  <TableRow>
                    <TableCell className='py-8 text-center text-muted-foreground' colSpan={columns.length}>
                      {emptyMessage}
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
      <ListPagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} loading={isLoading} />
    </div>
  )
}
