import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES, IMPERSONATION_COOKIES } from '@/lib/auth'
import { backendFetch } from '@/lib/backend-fetch'

// A batch is at most 50 short rows: anything much larger is not ours.
const MAX_BODY_BYTES = 16 * 1024

function done() {
  return new NextResponse(null, { status: 204 })
}

// Usage counts from the pages and the service worker. Always 204, never 401: a visitor or
// an expired session must not start a session refresh, and a lost count does not matter.
export async function POST(request: Request) {
  if (request.headers.get('sec-gpc') === '1' || request.headers.get('dnt') === '1') {
    return done()
  }
  const jar = await cookies()
  const accessToken = jar.get(AUTH_COOKIES.access)?.value
  if (!accessToken || jar.get(IMPERSONATION_COOKIES.active)?.value === 'true') {
    return done()
  }
  const body = await request.text()
  if (body.length === 0 || body.length > MAX_BODY_BYTES) {
    return done()
  }
  try {
    const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
    await backendFetch(`${apiBaseUrl}/analytics/events`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body,
      cache: 'no-store'
    })
  } catch {
    // Counting must never surface an error.
  }
  return done()
}
