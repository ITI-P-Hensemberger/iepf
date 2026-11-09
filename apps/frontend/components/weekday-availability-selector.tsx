'use client'

import * as React from 'react'
import { Calendar } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { SegmentedTabs } from '@/components/segmented-tabs'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const WEEKDAYS = [
  { value: 1, label: 'Lunedì' },
  { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' },
  { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' }
] as const

const START_TIMES = [
  { value: '14:00', label: '14–15' },
  { value: '15:00', label: '15–16' },
  { value: '14:00-16:00', label: '14–16 · 2 ore' }
] as const
type StartTime = (typeof START_TIMES)[number]['value']

export type WeekdayAvailability = {
  weekday: number
  isAvailable: boolean
  startTime: StartTime | null
}

// Every school day once, as the API returns it or off when it is missing.
export function normalizeWeekdays(payload: { weekdays?: WeekdayAvailability[] }): WeekdayAvailability[] {
  return WEEKDAYS.map((day) => {
    const match = payload.weekdays?.find((item) => item.weekday === day.value)
    return {
      weekday: day.value,
      isAvailable: match?.isAvailable ?? false,
      startTime: match?.isAvailable ? (match?.startTime ?? null) : null
    }
  })
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

  // Hours a week, for the summary: each day is one or two lessons.
  const hours = value.reduce((sum, day) => sum + (day.isAvailable ? (day.startTime === '14:00-16:00' ? 2 : 1) : 0), 0)

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='space-y-1'>
          <h3 className='flex items-center gap-2 font-semibold'>
            <Calendar className='size-4 text-muted-foreground' aria-hidden /> Disponibilità settimanale
          </h3>
          <p className='text-sm text-muted-foreground'>
            Accendi i giorni in cui puoi fare lezione e scegli la fascia oraria.
          </p>
        </div>
        <Badge variant={selectedCount > 0 ? 'secondary' : 'outline'}>
          {selectedCount === 0
            ? 'Nessun giorno'
            : `${selectedCount} ${selectedCount === 1 ? 'giorno' : 'giorni'} · ${hours} ${hours === 1 ? 'ora' : 'ore'} a settimana`}
        </Badge>
      </div>

      <ul className='divide-y rounded-lg border'>
        {WEEKDAYS.map((day) => {
          const availability = value.find((item) => item.weekday === day.value)
          const isSelected = availability?.isAvailable ?? false
          const startTime = availability?.startTime ?? null
          const switchId = `availability-${day.value}`
          return (
            <li
              key={day.value}
              className={cn(
                'flex flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between',
                isSelected ? 'bg-primary/[0.03]' : ''
              )}
            >
              <label htmlFor={switchId} className={cn('flex items-center gap-3', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
                <Switch
                  id={switchId}
                  checked={isSelected}
                  disabled={disabled}
                  onCheckedChange={(checked) => handleToggle(day.value, checked)}
                  aria-label={`${day.label}: disponibile`}
                />
                <span className={cn('font-medium', !isSelected && 'text-muted-foreground')}>{day.label}</span>
              </label>
              {isSelected ? (
                <SegmentedTabs
                  label={`Fascia oraria di ${day.label.toLowerCase()}`}
                  stretch
                  value={startTime ?? '15:00'}
                  onValueChange={(next) => handleStartTimeChange(day.value, next as StartTime)}
                  options={START_TIMES.map((slot) => ({ value: slot.value, label: slot.label }))}
                />
              ) : (
                <span className='text-sm text-muted-foreground sm:pr-1'>Non disponibile</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
