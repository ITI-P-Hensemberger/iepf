'use client'

import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// The search box of every list: the same icon, size and label everywhere.
export function SearchField({
  id,
  value,
  onChange,
  placeholder,
  className
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' aria-hidden />
      <Input
        id={id}
        type='search'
        aria-label='Cerca'
        placeholder={placeholder}
        value={value}
        onChange={event => onChange(event.target.value)}
        className='pl-9'
      />
    </div>
  )
}

// Text typed in a search box, handed on a moment after the last key.
export const SEARCH_DELAY = 400
