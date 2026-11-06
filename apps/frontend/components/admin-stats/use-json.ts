'use client'

import * as React from 'react'
import { toast } from 'sonner'

type Result<T> = { url: string, data?: T, failed?: boolean }

// GETs a JSON endpoint whenever the URL changes. Loading is derived from which URL the last
// answer belongs to, so no state is set synchronously inside the effect. The previous data
// stays available while the next URL loads, so tables keep their rows during paging.
export function useJson<T>(url: string | null, errorMessage: string) {
  const [result, setResult] = React.useState<Result<T> | null>(null)
  const [previous, setPrevious] = React.useState<T | undefined>(undefined)

  React.useEffect(() => {
    if (!url) return
    let active = true
    fetch(url, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(errorMessage)
        return (await response.json()) as T
      })
      .then((data) => {
        if (!active) return
        setResult({ url, data })
        setPrevious(data)
      })
      .catch(() => {
        if (!active) return
        setResult({ url, failed: true })
        toast.error(errorMessage)
      })
    return () => {
      active = false
    }
  }, [url, errorMessage])

  const current = result?.url === url ? result : null
  return {
    data: current ? current.data : previous,
    loading: url !== null && current === null,
    failed: current?.failed === true
  }
}
