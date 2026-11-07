'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Back always leads where the user came from. A link to an inner page carries the page it was
// opened on in ?from= (path and query, so filters, tabs and days survive); the inner page's back
// button goes there, or to its usual parent when the page was opened some other way.
export const FROM_PARAM = 'from'

// Only a path on this site: never another host, never a protocol.
export function safeFrom(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null
  }
  return value
}

// href with ?from=<from> added, keeping the rest of its query.
export function withFrom(href: string, from: string) {
  const url = new URL(href, 'http://local')
  url.searchParams.set(FROM_PARAM, from)
  return `${url.pathname}${url.search}${url.hash}`
}

export function pathWithQuery(pathname: string, search: string) {
  return search ? `${pathname}?${search}` : pathname
}

// The page being shown, to pass as ?from= to the pages it links to.
export function useHere() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return pathWithQuery(pathname, searchParams.toString())
}

// Where this page's back button leads: the page it was opened from, else fallback.
export function useBackHref(fallback: string) {
  return safeFrom(useSearchParams().get(FROM_PARAM)) ?? fallback
}

// Sets or clears one query parameter of the current page in place, keeping the others (from
// among them): for tabs and sections that should survive a trip to another page and back.
export function useSetParam() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.replace(pathWithQuery(pathname, params.toString()), { scroll: false })
  }
}
