import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const incomingUrl = new URL(request.url)
  const targetUrl = new URL(`${apiBaseUrl}/lessons/me`)
  const targetParams = new URLSearchParams()
  const allowedKeys = [
    'from',
    'to',
    'lessonStatus',
    'bookingStatus',
    'sortBy',
    'sortDir',
    'limit',
    'offset'
  ]

  allowedKeys.forEach((key) => {
    const value = incomingUrl.searchParams.get(key)
    if (value) {
      targetParams.set(key, value)
    }
  })

  targetUrl.search = targetParams.toString()

  const response = await backendFetch(targetUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  })

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to fetch lessons.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
