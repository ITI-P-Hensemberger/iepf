'use client'

// The two presence marks, stacked and colored: green for present, red for absent, outlined
// until set and filled once set. They come before every other action on a booking.
import { Check, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PresenceButtons({
  value,
  disabled,
  onPresent,
  onAbsent,
  className
}: {
  value: boolean | null
  disabled?: boolean
  onPresent: () => void
  onAbsent: () => void
  className?: string
}) {
  return (
    <div className={cn('flex w-full flex-col gap-2 sm:w-32', className)} role='group' aria-label='Presenza'>
      <Button
        variant='outline'
        aria-pressed={value === true}
        disabled={disabled}
        onClick={onPresent}
        className={cn(
          'w-full border-emerald-600 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-700 dark:text-emerald-400',
          value === true && 'bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white dark:bg-emerald-600 dark:text-white'
        )}
      >
        <Check className='h-4 w-4' /> Presente
      </Button>
      <Button
        variant='outline'
        aria-pressed={value === false}
        disabled={disabled}
        onClick={onAbsent}
        className={cn(
          'w-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive',
          value === false && 'bg-destructive text-white hover:bg-destructive/90 hover:text-white dark:bg-destructive'
        )}
      >
        <X className='h-4 w-4' /> Assente
      </Button>
    </div>
  )
}
