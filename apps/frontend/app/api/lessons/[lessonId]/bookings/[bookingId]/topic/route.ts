import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

type TopicBody = {
  topic: string
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

  let body: Partial<TopicBody> | null = null

  try {
    body = (await request.json()) as Partial<TopicBody>
  } catch {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  if (typeof body.topic !== 'string' || !body.topic.trim()) {
    return NextResponse.json({ message: 'Invalid topic.' }, { status: 400 })
  }

  const response = await backendFetch(
    `${apiBaseUrl}/lessons/${lessonId}/bookings/${bookingId}/topic`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ topic: body.topic })
    }
  )

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to update topic.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
