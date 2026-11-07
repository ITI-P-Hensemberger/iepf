'use client'

import * as React from 'react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface SegmentedOption {
  value: string
  label: React.ReactNode
}

// A switch between views of the same list or panel (Prossime / Passate, Aggiungi / Togli…),
// with the look and keyboard behaviour of the page tabs. The content below is the caller's.
export function SegmentedTabs({
  options,
  value,
  onValueChange,
  label,
  stretch = false,
  className
}: {
  options: readonly SegmentedOption[]
  value: string
  onValueChange: (value: string) => void
  label: string
  // Full width on a phone, each option an equal share.
  stretch?: boolean
  className?: string
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={className}>
      <TabsList aria-label={label} className={stretch ? 'w-full sm:w-fit' : undefined}>
        {options.map(option => (
          <TabsTrigger key={option.value} value={option.value} className={stretch ? 'flex-1 sm:flex-none' : undefined}>{option.label}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
