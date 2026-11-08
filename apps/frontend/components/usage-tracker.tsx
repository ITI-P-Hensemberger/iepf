'use client'

import { usePathname } from 'next/navigation'
import * as React from 'react'

import { enableUsageCounting, errorEventName, flushUsage, pageTemplate, rejectionName, track } from '@/lib/usage-analytics'

const FLUSH_INTERVAL_MS = 30_000
// A page stuck in an error loop must not fill the queue.
const MAX_ERRORS_PER_PAGE_LOAD = 20

let listening = false
let errorsCounted = 0

function listenOnce() {
  if (listening) return
  listening = true
  const countError = (name: string) => {
    if (errorsCounted >= MAX_ERRORS_PER_PAGE_LOAD) return
    errorsCounted += 1
    track('client_error', `${name}@${pageTemplate(window.location.pathname)}`)
  }
  window.addEventListener('error', (event) => {
    // Errors from extensions or other origins are not ours.
    if (event.filename && !event.filename.startsWith(window.location.origin)) return
    const name = errorEventName(event.error, event.message ?? '')
    if (name) countError(name)
  })
  window.addEventListener('unhandledrejection', event => countError(rejectionName(event.reason)))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushUsage()
  })
  window.addEventListener('pagehide', flushUsage)
  window.setInterval(flushUsage, FLUSH_INTERVAL_MS)
}

// Mounted by the header for signed-in users only: visitors are never counted.
export function UsageTracker({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname()

  React.useEffect(() => {
    enableUsageCounting(signedIn)
    if (signedIn) listenOnce()
  }, [signedIn])

  React.useEffect(() => {
    if (signedIn && pathname) track('page_view', pageTemplate(pathname))
  }, [signedIn, pathname])

  return null
}
