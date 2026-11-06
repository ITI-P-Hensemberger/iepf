'use client'

import type { TooltipContentProps } from 'recharts'

import * as React from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// Recessive axes and grid; text in the theme's ink, never in a series colour.
export const axisProps = {
  stroke: 'var(--border)',
  tick: { fill: 'var(--muted-foreground)', fontSize: 12 },
  tickLine: false,
  axisLine: false
} as const

export const gridProps = { stroke: 'var(--border)', strokeDasharray: '3 3', vertical: false } as const

const numberFormat = new Intl.NumberFormat('it-IT')
export const formatNumber = (value: number) => numberFormat.format(value)

export function ChartTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null
  return (
    <div className='rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md'>
      {label != null && <div className='mb-1 font-medium'>{String(label)}</div>}
      <ul className='space-y-0.5'>
        {payload.map(item => (
          <li key={String(item.dataKey)} className='flex items-center gap-2'>
            <span className='size-2 rounded-full' style={{ background: item.color }} aria-hidden />
            <span className='text-muted-foreground'>{item.name}</span>
            <span className='ml-auto font-medium tabular-nums'>{formatNumber(Number(item.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Legend({ items }: { items: Array<{ label: string, color: string }> }) {
  if (items.length < 2) return null
  return (
    <ul className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
      {items.map(item => (
        <li key={item.label} className='flex items-center gap-1.5'>
          <span className='size-2.5 rounded-sm' style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

type Column<T> = { key: keyof T & string, label: string, numeric?: boolean }

// The same numbers as the chart, for screen readers and for reading exact values.
export function DataView<T extends Record<string, unknown>>({ rows, columns }: { rows: T[], columns: Column<T>[] }) {
  return (
    <details className='text-sm'>
      <summary className='cursor-pointer text-muted-foreground hover:text-foreground'>Mostra i dati in tabella</summary>
      <div className='mt-2 max-h-72 overflow-auto rounded-lg border'>
        <Table>
          <TableHeader className='bg-muted/50'>
            <TableRow>
              {columns.map(column => (
                <TableHead key={column.key} className={column.numeric ? 'text-right' : undefined}>{column.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map(column => (
                  <TableCell key={column.key} className={column.numeric ? 'text-right tabular-nums' : undefined}>
                    {typeof row[column.key] === 'number' ? formatNumber(row[column.key] as number) : String(row[column.key] ?? '')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  )
}

export function ChartCard({ title, description, children, className }: { title: string, description?: string, children: React.ReactNode, className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className='space-y-3'>{children}</CardContent>
    </Card>
  )
}

export function EmptyChart({ children = 'Nessun dato nel periodo scelto.' }: { children?: React.ReactNode }) {
  return <p className='py-10 text-center text-sm text-muted-foreground'>{children}</p>
}

export function StatTile({ label, value, hint }: { label: string, value: string, hint?: string }) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='text-3xl tabular-nums'>{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className='pt-0 text-xs text-muted-foreground'>{hint}</CardContent>}
    </Card>
  )
}
