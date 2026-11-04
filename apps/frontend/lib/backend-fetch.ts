import { headers } from 'next/headers'

import { clientIpHeaders } from '@/lib/client-ip'

// For route handlers only: adds the client address for backend rate limits and audit logs.
export async function backendFetch(input: string, init: RequestInit = {}) {
  const merged = new Headers(init.headers)
  for (const [name, value] of Object.entries(clientIpHeaders(await headers()))) {
    merged.set(name, value)
  }
  return fetch(input, { ...init, headers: merged })
}
