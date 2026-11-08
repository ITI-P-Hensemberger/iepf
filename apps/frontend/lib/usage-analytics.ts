// Internal usage counts: the browser only adds up how many times something happened and
// sends the totals to our own backend every so often. No cookie, no id, no third party.
// The backend keeps them as daily counts per role and school year.

export type UsageEvent = 'page_view' | 'book_dialog_open' | 'bell_open' | 'inbox_click' | 'push_open' | 'client_error'
export type UsageCount = { event: UsageEvent, detail: string, count: number }

export const ANALYTICS_ENDPOINT = '/api/analytics'
export const MAX_EVENTS_PER_BATCH = 50
export const MAX_COUNT_PER_EVENT = 50

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i

// The page as a template: ids become [id], so no lesson or person can be told apart.
export function pageTemplate(pathname: string) {
  const segments = pathname.split('/').filter(Boolean).map(segment => ID_SEGMENT.test(segment) ? '[id]' : segment)
  return `/${segments.join('/')}`
}

type PrivacySignals = {
  globalPrivacyControl?: boolean
  doNotTrack?: string | null
  windowDoNotTrack?: string | null
  impersonating?: boolean
}

// The error's kind only: its message is never stored, so these names are all there is to tell errors apart.
export function errorEventName(error: unknown, message: string): string | null {
  // Harmless browser notice about layout observers, not a bug.
  if (message.startsWith('ResizeObserver loop')) return null
  // An error event without an error object (a failed script, a browser notice).
  if (error == null) return 'ScriptError'
  return error instanceof Error && error.name ? error.name : 'Error'
}

// A promise rejected with something that is not an Error (a string, a response object).
export function rejectionName(reason: unknown) {
  return reason instanceof Error ? (reason.name || 'Error') : 'Rejection'
}

// Global Privacy Control or Do Not Track turn counting off; so does impersonation, where the
// admin is not the person whose pages they are looking at.
export function countingAllowed(signals: PrivacySignals) {
  return signals.globalPrivacyControl !== true
    && signals.doNotTrack !== '1'
    && signals.windowDoNotTrack !== '1'
    && signals.impersonating !== true
}

export function browserCountingAllowed() {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return countingAllowed({
    globalPrivacyControl: nav.globalPrivacyControl,
    doNotTrack: nav.doNotTrack,
    windowDoNotTrack: (window as Window & { doNotTrack?: string }).doNotTrack,
    impersonating: document.cookie.split('; ').includes('iepf_impersonating=true')
  })
}

// Counts in memory until the next send.
export class UsageQueue {
  private counts = new Map<string, UsageCount>()

  add(event: UsageEvent, detail = '') {
    const key = `${event}\u0000${detail}`
    const existing = this.counts.get(key)
    if (existing) existing.count += 1
    else this.counts.set(key, { event, detail, count: 1 })
  }

  get size() {
    return this.counts.size
  }

  // Empties the queue into batches the backend accepts.
  drain() {
    const rows: UsageCount[] = []
    for (const row of this.counts.values()) {
      for (let left = row.count; left > 0; left -= MAX_COUNT_PER_EVENT) {
        rows.push({ ...row, count: Math.min(left, MAX_COUNT_PER_EVENT) })
      }
    }
    this.counts.clear()
    const batches: UsageCount[][] = []
    for (let start = 0; start < rows.length; start += MAX_EVENTS_PER_BATCH) {
      batches.push(rows.slice(start, start + MAX_EVENTS_PER_BATCH))
    }
    return batches
  }
}

const queue = new UsageQueue()
let enabled = false

export function enableUsageCounting(value: boolean) {
  enabled = value
}

export function track(event: UsageEvent, detail = '') {
  if (!enabled || !browserCountingAllowed()) return
  queue.add(event, detail)
}

// sendBeacon survives the page closing and skips the fetch wrapper that renews sessions.
// /api/analytics never answers 401 either, so the fetch fallback cannot start a refresh:
// a lost count is fine, a session refresh for it is not.
export function flushUsage() {
  if (queue.size === 0) return
  for (const events of queue.drain()) {
    const body = JSON.stringify({ events })
    const sent = typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon(ANALYTICS_ENDPOINT, new Blob([body], { type: 'application/json' }))
    if (!sent) {
      void window.fetch(ANALYTICS_ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => undefined)
    }
  }
}
