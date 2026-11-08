import { forwardToBackend } from '@/lib/backend-proxy'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {

  const incomingUrl = new URL(request.url)
  const targetParams = new URLSearchParams()
  const allowedKeys = ['lessonId', 'from', 'to', 'sortBy', 'sortDir', 'limit', 'offset']

  allowedKeys.forEach((key) => {
    const value = incomingUrl.searchParams.get(key)
    if (value) {
      targetParams.set(key, value)
    }
  })

  return forwardToBackend(`/feedback/me?${targetParams}`)
}
