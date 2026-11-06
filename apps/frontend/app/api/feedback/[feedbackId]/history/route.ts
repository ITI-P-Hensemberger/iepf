import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

// The history of a feedback: for its author (without names) and for the admins.
export async function GET(
  _request: Request,
  context: { params: Promise<{ feedbackId: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { feedbackId } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const response = await backendFetch(`${apiBaseUrl}/feedback/${encodeURIComponent(feedbackId)}/history`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store'
  })
  const parsed = parseBackendPayload(await response.text())

  if (!response.ok) {
    return NextResponse.json(
      { message: parsed.errorMessage || 'Impossibile caricare la cronologia.', error: parsed.errorPayload },
      { status: response.status }
    )
  }
  return NextResponse.json(parsed.data)
}
