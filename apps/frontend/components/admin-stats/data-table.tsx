'use client'

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type DataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData>[]
  isLoading: boolean
  emptyMessage: string
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function DataTable<TData>({ data, columns, isLoading, emptyMessage, page, pageSize, total, onPageChange }: DataTableProps<TData>) {
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rows = table.getRowModel().rows

  return (
    <div className='space-y-4'>
      <div className='rounded-lg border'>
        <Table>
          <TableHeader className='bg-muted/50'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading || rows.length === 0
              ? (
                  <TableRow>
                    <TableCell className='text-muted-foreground' colSpan={columns.length}>
                      {isLoading ? 'Caricamento...' : emptyMessage}
                    </TableCell>
                  </TableRow>
                )
              : rows.map(row => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      <div className='flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
        <span>
          Pagina {page} di {totalPages} · Totale {total}
        </span>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={() => onPageChange(page - 1)} disabled={page <= 1 || isLoading}>
            Precedente
          </Button>
          <Button variant='outline' size='sm' onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || isLoading}>
            Successiva
          </Button>
        </div>
      </div>
    </div>
  )
}
