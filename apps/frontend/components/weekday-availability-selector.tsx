'use client'

import * as React from 'react'
import { Calendar, Check } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const WEEKDAYS = [
  { value: 1, label: 'Lunedì' },
  { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' },
  { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' }
] as const

const START_TIMES = [
  { value: '14:00', label: '14:00 - 15:00 (1h)' },
  { value: '15:00', label: '15:00 - 16:00 (1h)' },
  { value: '14:00-16:00', label: '14:00 - 16:00 (2h)' }
] as const
type StartTime = (typeof START_TIMES)[number]['value']

export type WeekdayAvailability = {
  weekday: number
  isAvailable: boolean
  startTime: StartTime | null
}

type WeekdayAvailabilitySelectorProps = {
  value: WeekdayAvailability[]
  onChange: (value: WeekdayAvailability[]) => void
  disabled?: boolean
}

export function WeekdayAvailabilitySelector({
  value,
  onChange,
  disabled = false
}: WeekdayAvailabilitySelectorProps) {
  const selectedCount = value.filter((day) => day.isAvailable).length

  const updateAvailability = (
    weekday: number,
    updates: Partial<WeekdayAvailability>
  ) => {
    const existing =
      value.find((item) => item.weekday === weekday) ??
      ({
        weekday,
        isAvailable: false,
        startTime: null
      } as WeekdayAvailability)

    const next = { ...existing, ...updates }
    const nextValue = WEEKDAYS.map((day) => {
      if (day.value === weekday) return next
      return (
        value.find((item) => item.weekday === day.value) ?? {
          weekday: day.value,
          isAvailable: false,
          startTime: null
        }
      )
    })

    onChange(nextValue)
  }

  const handleToggle = (dayValue: number, isChecked: boolean) => {
    if (disabled) return

    if (!isChecked) {
      updateAvailability(dayValue, { isAvailable: false, startTime: null })
      return
    }

    const existing = value.find((item) => item.weekday === dayValue)
    updateAvailability(dayValue, {
      isAvailable: true,
      startTime: existing?.startTime ?? '15:00'
    })
  }

  const handleStartTimeChange = (dayValue: number, startTime: StartTime) => {
    if (disabled) return
    updateAvailability(dayValue, { isAvailable: true, startTime })
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Calendar className='h-5 w-5 text-primary' />
          <h3 className='text-base font-medium'>Disponibilità</h3>
        </div>
        {selectedCount > 0 && (
          <Badge variant='secondary' className='gap-1'>
            {selectedCount}{' '}
            {selectedCount === 1 ? 'giorno selezionato' : 'giorni selezionati'}
          </Badge>
        )}
      </div>

      <p className='text-sm text-muted-foreground'>
        Seleziona i giorni e scegli l&apos;orario di inizio della lezione.
      </p>

      <div className='space-y-4 sm:space-y-2'>
        {WEEKDAYS.map((day) => {
          const availability = value.find((item) => item.weekday === day.value)
          const isSelected = availability?.isAvailable ?? false
          const startTime = availability?.startTime ?? null
          return (
            <div
              key={day.value}
              className='flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between'
            >
              <div
                role='button'
                tabIndex={disabled ? -1 : 0}
                onClick={() => handleToggle(day.value, !isSelected)}
                onKeyDown={(event) => {
                  if (disabled) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleToggle(day.value, !isSelected)
                  }
                }}
                aria-pressed={isSelected}
                className={`
                  w-full flex items-center justify-between rounded-lg border p-4 text-left transition-all
                  ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <span
                  className={`font-medium ${isSelected ? 'text-primary' : ''}`}
                >
                  {day.label}
                </span>
                {isSelected && (
                  <div className='flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground'>
                    <Check className='h-3 w-3' />
                  </div>
                )}
              </div>

              {isSelected && (
                <div className='w-full sm:w-56'>
                  <Select
                    value={startTime ?? undefined}
                    onValueChange={(value) =>
                      handleStartTimeChange(day.value, value as StartTime)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className='w-full h-full min-h-16 justify-between whitespace-nowrap'>
                      <SelectValue placeholder='Ora inizio' />
                    </SelectTrigger>
                    <SelectContent>
                      {START_TIMES.map((slot) => (
                        <SelectItem key={slot.value} value={slot.value}>
                          {slot.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
