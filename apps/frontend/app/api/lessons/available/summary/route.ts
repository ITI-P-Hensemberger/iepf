import { type NextRequest } from 'next/server'

import { forwardToBackend } from '@/lib/backend-proxy'

// Bookable lesson counts per subject and per day, for the student's booking page.
export async function GET(request: NextRequest) {
  const incoming = new URL(request.url).searchParams
  const params = new URLSearchParams()
  for (const key of ['from', 'to', 'subjectId']) {
    const value = incoming.get(key)
    if (value) params.set(key, value)
  }
  return forwardToBackend(`/lessons/available/summary?${params}`)
}
