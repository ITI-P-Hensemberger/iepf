'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

function differs(draft: object, applied: object) {
  const a = applied as Record<string, unknown>
  return Object.entries(draft).some(([key, value]) => JSON.stringify(value ?? null) !== JSON.stringify(a[key] ?? null))
}

// A list's filters, applied as they change: no "Applica" button. The form submits itself a
// moment after the last change (so typing a search does not reload at every letter), and only
// when the fields differ from the filters already applied, so filling the fields from the URL
// (on load, or back from a detail page) does not send the list back to page one.
export function FilterForm({
  values,
  applied,
  onSubmit,
  delay = 400,
  className,
  children
}: {
  values: object
  applied: object
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  delay?: number
  className?: string
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLFormElement>(null)
  const key = JSON.stringify(values)
  const latest = React.useRef({ values, applied })
  React.useEffect(() => {
    latest.current = { values, applied }
  })

  React.useEffect(() => {
    if (!differs(latest.current.values, latest.current.applied)) return
    const timer = window.setTimeout(() => {
      if (differs(latest.current.values, latest.current.applied)) ref.current?.requestSubmit()
    }, delay)
    return () => window.clearTimeout(timer)
  }, [key, delay])

  return (
    <form ref={ref} onSubmit={onSubmit} className={cn('rounded-lg border bg-card p-4', className)}>
      {children}
    </form>
  )
}
