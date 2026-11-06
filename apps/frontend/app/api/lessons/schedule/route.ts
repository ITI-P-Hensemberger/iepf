import { type NextRequest } from 'next/server'

import { forwardToBackend } from '@/lib/backend-proxy'

// Lessons with their bookings for a day or a week: the tutor's own, or every tutor's for admins.
export async function GET(request: NextRequest) {
  const incoming = new URL(request.url).searchParams
  const params = new URLSearchParams()
  for (const key of ['from', 'to', 'tutorId', 'subjectId']) {
    const value = incoming.get(key)
    if (value) params.set(key, value)
  }
  return forwardToBackend(`/lessons/schedule?${params}`)
}
