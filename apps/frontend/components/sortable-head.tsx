'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export type SortDir = 'asc' | 'desc'

// The next sort when a header is clicked: the same column flips direction, a new one starts
// from its natural order.
export function nextSort(current: { sortBy: string, sortDir: SortDir }, key: string, firstDir: SortDir = 'asc') {
  return current.sortBy === key
    ? { sortBy: key, sortDir: current.sortDir === 'asc' ? 'desc' as const : 'asc' as const }
    : { sortBy: key, sortDir: firstDir }
}

// A column header that sorts the list: every list sorts from its headers, never from a filter.
export function SortableHead({
  label,
  sortKey,
  sortBy,
  sortDir,
  onSort,
  className
}: {
  label: React.ReactNode
  sortKey: string
  sortBy: string
  sortDir: SortDir
  onSort: (key: string) => void
  className?: string
}) {
  const active = sortBy === sortKey
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
  return (
    <button
      type='button'
      onClick={() => onSort(sortKey)}
      aria-label={`Ordina per ${typeof label === 'string' ? label.toLowerCase() : sortKey}`}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn(
        '-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground',
        active ? 'text-foreground' : 'text-muted-foreground',
        className
      )}
    >
      {label}
      <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden />
    </button>
  )
}
