import * as React from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'

// What a page shows while it loads: the shape of what is coming, never a bare "Caricamento...".
// That word stays only inside buttons ("Salvataggio...") and small inline values.

// A whole page: back button, title, a few blocks.
export function PageSkeleton() {
  return (
    <div className='container mx-auto px-4 pt-10 pb-16' aria-busy='true' aria-label='Caricamento'>
      <div className='mx-auto w-full max-w-6xl space-y-4'>
        <Skeleton className='h-8 w-28 rounded-full' />
        <Skeleton className='h-8 w-64' />
        <Skeleton className='mt-6 h-24' />
        <Skeleton className='h-24' />
      </div>
    </div>
  )
}

// A few lines inside a card or section.
export function BlockSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className='space-y-3' aria-busy='true' aria-label='Caricamento'>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className='h-9' style={{ width: `${100 - index * 15}%` }} />
      ))}
    </div>
  )
}

// Rows of a table that is still loading.
// True until a list has finished loading once: only then is there nothing to show but a skeleton.
// Later reloads keep what is on screen (rows, or the empty message), dimmed, so the table holds still.
export function useFirstLoad(isLoading: boolean) {
  const [loaded, setLoaded] = React.useState(!isLoading)
  if (!isLoading && !loaded) setLoaded(true)
  return !loaded
}

export function TableSkeletonRows({ columns, rows = 5 }: { columns: number, rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row} aria-busy='true'>
          {Array.from({ length: columns }, (_, column) => (
            <TableCell key={column}><Skeleton className='h-4 w-full max-w-32' /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
