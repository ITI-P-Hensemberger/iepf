import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

type CancelBody = {
  countsForStudent?: boolean
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string; bookingId: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { lessonId, bookingId } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<CancelBody> | null = null

  try {
    body = (await request.json()) as Partial<CancelBody>
  } catch {
    body = null
  }

  const payload: Partial<CancelBody> = {}
  if (typeof body?.countsForStudent === 'boolean') {
    payload.countsForStudent = body.countsForStudent
  }

  const response = await backendFetch(
    `${apiBaseUrl}/lessons/${lessonId}/bookings/${bookingId}/cancel`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  )

  const payloadText = await response.text()
  const parsed = parseBackendPayload(payloadText)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to cancel booking.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
