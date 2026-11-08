'use client'

import * as React from 'react'
import { addDays, endOfMonth, endOfWeek, format, isSameDay, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { CalendarIcon, X } from 'lucide-react'
import type { DateRange, Matcher } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// The date pickers of the site: a button that shows the choice, opening a calendar in a
// popover. Ranges come with shortcuts and apply at once, without an "Applica" step.

const label = (date: Date) => format(date, 'dd/MM/yyyy')

function rangeLabel(range: DateRange) {
  if (!range.from) return null
  if (!range.to || isSameDay(range.from, range.to)) return label(range.from)
  return `${label(range.from)} – ${label(range.to)}`
}

// September to August: the year the project runs on.
export function schoolYearOf(date: Date): DateRange {
  const start = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1
  return { from: new Date(start, 8, 1), to: new Date(start + 1, 7, 31) }
}

const PRESETS: Array<{ label: string, range: (today: Date) => DateRange }> = [
  { label: 'Oggi', range: today => ({ from: today, to: today }) },
  { label: 'Questa settimana', range: today => ({ from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfWeek(today, { weekStartsOn: 1 }) }) },
  { label: 'Prossimi 7 giorni', range: today => ({ from: today, to: addDays(today, 6) }) },
  { label: 'Questo mese', range: today => ({ from: startOfMonth(today), to: endOfMonth(today) }) },
  { label: 'Anno scolastico', range: schoolYearOf }
]

function Trigger({ id, text, placeholder, onClear, className, ...props }: React.ComponentProps<typeof Button> & {
  text: string | null
  placeholder: string
  onClear?: () => void
}) {
  return (
    <div className={cn('relative flex min-w-0', className)}>
      <Button
        id={id}
        type='button'
        variant='outline'
        className={cn('w-full min-w-0 justify-start px-2.5 font-normal', text && onClear && 'pr-9')}
        {...props}
      >
        <CalendarIcon className='size-4 text-muted-foreground' />
        <span className={cn('truncate', !text && 'text-muted-foreground')}>{text ?? placeholder}</span>
      </Button>
      {text && onClear && (
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='absolute top-1/2 right-1 size-7 -translate-y-1/2'
          aria-label='Cancella la data'
          onClick={onClear}
        >
          <X className='size-4' />
        </Button>
      )}
    </div>
  )
}

export function DatePicker({
  id,
  value,
  onChange,
  disabled,
  modifiers,
  placeholder = 'Scegli una data',
  clearable = false,
  className
}: {
  id?: string
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  // Days that cannot be picked (weekends, closures, the past): see useSchoolDays.
  disabled?: Matcher | Matcher[]
  modifiers?: React.ComponentProps<typeof Calendar>['modifiers']
  placeholder?: string
  clearable?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Trigger
          id={id}
          text={value ? label(value) : null}
          placeholder={placeholder}
          onClear={clearable ? () => onChange(undefined) : undefined}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0' align='start'>
        <Calendar
          mode='single'
          selected={value}
          defaultMonth={value ?? new Date()}
          disabled={disabled}
          modifiers={modifiers}
          onSelect={(date) => {
            onChange(date)
            if (date) setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export function DateRangePicker({
  id,
  value,
  onChange,
  placeholder = 'Tutto il periodo',
  className
}: {
  id?: string
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const today = startOfDay(new Date())
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Trigger
          id={id}
          text={value ? rangeLabel(value) : null}
          placeholder={placeholder}
          onClear={() => onChange(undefined)}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent className='flex w-auto flex-col p-0 sm:flex-row' align='start'>
        <ul className='grid grid-cols-2 gap-1 border-b p-2 sm:flex sm:w-40 sm:flex-col sm:border-r sm:border-b-0'>
          {PRESETS.map(preset => (
            <li key={preset.label}>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='w-full justify-start font-normal'
                onClick={() => {
                  onChange(preset.range(today))
                  setOpen(false)
                }}
              >
                {preset.label}
              </Button>
            </li>
          ))}
        </ul>
        <Calendar
          mode='range'
          selected={value}
          defaultMonth={value?.from ?? today}
          onSelect={(range, picked) => {
            // A click after a complete range starts a new one, instead of stretching the old.
            const next = value?.from && value.to ? { from: picked, to: undefined } : range
            onChange(next)
            if (next?.from && next.to) setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

// Days a lesson can be on: no weekends, no closures, nothing before today. Closures come from
// the global settings, which only admins read.
export function useSchoolDays() {
  const [closures, setClosures] = React.useState<Date[]>([])
  React.useEffect(() => {
    let current = true
    fetch('/api/settings', { cache: 'no-store' })
      .then(response => (response.ok ? response.json() : null))
      .then((payload: { closureDates?: string[], data?: { closureDates?: string[] } } | null) => {
        const dates = payload?.closureDates ?? payload?.data?.closureDates ?? []
        if (current) setClosures(dates.map(key => new Date(`${key}T00:00:00`)))
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [])
  return React.useMemo(() => ({
    disabled: [{ dayOfWeek: [0, 6] }, { before: startOfDay(new Date()) }, ...closures] as Matcher[],
    modifiers: { closed: closures }
  }), [closures])
}
