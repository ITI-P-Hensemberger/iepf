import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

type PresenceBody = {
  present: boolean | null
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

  let body: Partial<PresenceBody> | null = null

  try {
    body = (await request.json()) as Partial<PresenceBody>
  } catch {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  if (body.present !== null && typeof body.present !== 'boolean') {
    return NextResponse.json(
      { message: 'Invalid presence value.' },
      { status: 400 }
    )
  }

  const response = await fetch(
    `${apiBaseUrl}/lessons/${lessonId}/bookings/${bookingId}/presence`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ present: body.present })
    }
  )

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to update presence.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
