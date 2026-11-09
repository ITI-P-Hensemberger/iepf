'use client'

import { SegmentedTabs } from '@/components/segmented-tabs'
import * as React from 'react'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, jsonBody } from '@/lib/api-fetch'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { capitalizeFirst } from '@/lib/capitalize'
import { formatItalianDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

type Direction = 'add' | 'remove'

type HistoryItem = {
  id: string
  delta: number
  reason: string
  createdAt: string
  adminName: string | null
}

const REASONS: Record<Direction, string[]> = {
  add: ['Recupero lezione', 'Ore aggiuntive pagate', 'Correzione'],
  remove: ['Correzione', 'Lezione svolta fuori piattaforma']
}

function hoursLabel(n: number) {
  return `${n} ${n === 1 ? 'ora' : 'ore'}`
}

// The "Ore di lezione" section of a student in the admin area: the balance, a form to add or
// remove hours by hand with a preview of the result, and every manual change made so far.
export function AdminStudentHours({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient()
  const [direction, setDirection] = React.useState<Direction>('add')
  const [amount, setAmount] = React.useState(1)
  const [reason, setReason] = React.useState('')

  const { data, isPending: loading } = useQuery({
    queryKey: ['users', studentId, 'tokens'],
    queryFn: () => apiFetch<{ lessonTokens: number, items: HistoryItem[] }>(
      `/api/users/${studentId}/tokens/history`,
      'Impossibile caricare lo storico delle ore.'
    )
  })
  const balance = data?.lessonTokens ?? null
  const history = data?.items ?? []

  const delta = direction === 'add' ? amount : -amount
  // The balance never goes below zero: the backend applies only what is there.
  const after = balance === null ? null : Math.max(0, balance + delta)
  const valid = Number.isInteger(amount) && amount > 0 && reason.trim().length > 0

  const adjust = useMutation({
    mutationFn: (change: { delta: number, reason: string }) => apiFetch(
      `/api/users/${studentId}/tokens/adjust`,
      'Impossibile aggiornare le ore di lezione.',
      jsonBody('POST', change)
    ),
    onSuccess: (_, change) => {
      const hours = capitalizeFirst(hoursLabel(Math.abs(change.delta)))
      toast.success(change.delta > 0 ? `${hours} aggiunte.` : `${hours} tolte.`)
      setAmount(1)
      setReason('')
      // The balance here and on the rest of the student's page.
      return queryClient.invalidateQueries({ queryKey: ['users', studentId] })
    }
  })
  const saving = adjust.isPending

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) {
      toast.error(reason.trim() ? 'Inserisci un numero di ore valido.' : 'Inserisci una motivazione.')
      return
    }
    adjust.mutate({ delta, reason: reason.trim() })
  }

  return (
    <div className='space-y-6'>
      <section className='rounded-lg border bg-card p-4 sm:p-6'>
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div>
            <p className='text-sm text-muted-foreground'>Ore disponibili</p>
            {loading && balance === null
              ? <Skeleton className='mt-1 h-9 w-16' />
              : <p className='text-3xl font-semibold tabular-nums'>{balance ?? '-'}</p>}
          </div>
          <SegmentedTabs
            label='Operazione'
            value={direction}
            onValueChange={(value) => setDirection(value as Direction)}
            options={[
              { value: 'add', label: <><Plus className='size-4' /> Aggiungi</> },
              { value: 'remove', label: <><Minus className='size-4' /> Togli</> }
            ]}
          />
        </div>

        <form onSubmit={submit} className='mt-6 space-y-4'>
          <div className='grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]'>
            <div className='space-y-2'>
              <label htmlFor='hours-amount' className='text-sm font-medium'>Ore</label>
              <div className='flex items-center gap-1'>
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  aria-label='Una in meno'
                  disabled={amount <= 1 || saving}
                  onClick={() => setAmount(value => Math.max(1, value - 1))}
                >
                  <Minus className='size-4' />
                </Button>
                <Input
                  id='hours-amount'
                  type='number'
                  min={1}
                  step={1}
                  inputMode='numeric'
                  className='w-16 text-center tabular-nums'
                  value={Number.isNaN(amount) ? '' : amount}
                  onChange={event => setAmount(Number.parseInt(event.target.value, 10))}
                  disabled={saving}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  aria-label='Una in più'
                  disabled={saving}
                  onClick={() => setAmount(value => (Number.isNaN(value) ? 1 : value + 1))}
                >
                  <Plus className='size-4' />
                </Button>
              </div>
            </div>
            <div className='space-y-2'>
              <label htmlFor='hours-reason' className='text-sm font-medium'>Motivazione</label>
              <Input
                id='hours-reason'
                value={reason}
                maxLength={200}
                onChange={event => setReason(capitalizeFirst(event.target.value))}
                placeholder='Es. recupero della lezione del 12 marzo'
                disabled={saving}
              />
              <div className='flex flex-wrap gap-1.5'>
                {REASONS[direction].map(suggestion => (
                  <button
                    key={suggestion}
                    type='button'
                    className='rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                    onClick={() => setReason(suggestion)}
                    disabled={saving}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className='flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
            <p className='text-sm text-muted-foreground'>
              {balance !== null && after !== null && Number.isInteger(amount) && amount > 0 ? (
                <>
                  Dopo: <span className='font-medium text-foreground tabular-nums'>{balance} → {after}</span>
                  {direction === 'remove' && balance + delta < 0 && ' (non si scende sotto zero)'}
                </>
              ) : 'Scegli quante ore e perché.'}
            </p>
            <Button type='submit' disabled={saving || !valid} className='w-full sm:w-auto'>
              {saving
                ? 'Aggiornamento...'
                : `${direction === 'add' ? 'Aggiungi' : 'Togli'} ${Number.isInteger(amount) && amount > 0 ? hoursLabel(amount) : 'ore'}`}
            </Button>
          </div>
        </form>
      </section>

      <section className='space-y-3'>
        <h2 className='text-lg font-semibold'>Modifiche manuali</h2>
        {loading ? (
          <div className='space-y-2'>
            <Skeleton className='h-14' />
            <Skeleton className='h-14' />
          </div>
        ) : history.length === 0 ? (
          <EmptyState>Nessuna modifica manuale: le ore sono cambiate solo con prenotazioni e annullamenti.</EmptyState>
        ) : (
          <ul className='divide-y rounded-lg border bg-card'>
            {history.map(item => (
              <li key={item.id} className='flex items-start gap-3 px-4 py-3'>
                <span
                  className={cn(
                    'w-12 shrink-0 text-right font-semibold tabular-nums',
                    item.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                  )}
                >
                  {item.delta > 0 ? `+${item.delta}` : `−${Math.abs(item.delta)}`}
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='break-words'>{item.reason}</p>
                  <p className='text-sm text-muted-foreground'>
                    {[formatItalianDate(item.createdAt), item.adminName].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
