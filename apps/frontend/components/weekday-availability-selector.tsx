'use client'

import * as React from 'react'
import { Calendar, Check } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

const WEEKDAYS = [
  { value: 1, label: 'Lunedì' },
  { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' },
  { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' }
] as const

type WeekdayAvailabilitySelectorProps = {
  value: number[]
  onChange: (value: number[]) => void
  disabled?: boolean
  timeSlot?: string
}

export function WeekdayAvailabilitySelector({
  value,
  onChange,
  disabled = false,
  timeSlot = '15:00 - 16:00'
}: WeekdayAvailabilitySelectorProps) {
  const selectedCount = value.length

  const handleToggle = (dayValue: number) => {
    if (disabled) return

    if (value.includes(dayValue)) {
      onChange(value.filter((v) => v !== dayValue))
    } else {
      onChange([...value, dayValue])
    }
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
        Seleziona i giorni in cui sei disponibile. <br />
        L'orario delle lezioni è sempre {timeSlot} (1h).
      </p>

      <div className='space-y-2'>
        {WEEKDAYS.map((day) => {
          const isSelected = value.includes(day.value)
          return (
            <button
              key={day.value}
              type='button'
              onClick={() => handleToggle(day.value)}
              disabled={disabled}
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
            </button>
          )
        })}
      </div>
    </div>
  )
}
