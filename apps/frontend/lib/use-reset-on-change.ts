'use client'

import * as React from 'react'

// Calls `reset(value)` on the first render and in every render where `value` changes (compared as
// JSON, so a new object with the same fields is no change). For drafts that follow a source, like
// a filter form that follows the URL: React's "adjust state while rendering", without an effect
// and its extra render.
export function useResetOnChange<T>(value: T, reset: (value: T) => void) {
  const key = JSON.stringify(value)
  const [seen, setSeen] = React.useState<string | null>(null)
  if (seen !== key) {
    setSeen(key)
    reset(value)
  }
}
