'use client'

import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'

// A 1–5 rating as five stars; read-only when there is no onChange.
export function StarRating({ value, onChange, size = 'md' }: { value: number, onChange?: (value: number) => void, size?: 'sm' | 'md' }) {
  return (
    <div className='flex gap-1' role={onChange ? 'radiogroup' : 'img'} aria-label={`Valutazione ${value} su 5`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const icon = <Star className={cn(size === 'sm' ? 'h-4 w-4' : 'h-7 w-7', star <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
        return onChange
          ? (
              <button key={star} type='button' role='radio' aria-checked={value === star} aria-label={`${star} su 5`} className='rounded p-0.5' onClick={() => onChange(star)}>
                {icon}
              </button>
            )
          : <span key={star}>{icon}</span>
      })}
    </div>
  )
}
