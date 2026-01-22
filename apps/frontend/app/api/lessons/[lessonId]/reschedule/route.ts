import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

type RescheduleBody = {
  tutorId: string
  subjectId: string
  startAt: string
  durationMinutes: number
}

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { lessonId } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<RescheduleBody> | null = null

  try {
    body = (await request.json()) as Partial<RescheduleBody>
  } catch {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  const payload: Partial<RescheduleBody> = {}

  if (typeof body.tutorId === 'string') {
    payload.tutorId = body.tutorId
  }
  if (typeof body.subjectId === 'string') {
    payload.subjectId = body.subjectId
  }
  if (typeof body.startAt === 'string') {
    payload.startAt = body.startAt
  }
  if (typeof body.durationMinutes === 'number') {
    payload.durationMinutes = body.durationMinutes
  }
  if (
    !payload.tutorId ||
    !payload.subjectId ||
    !payload.startAt ||
    !payload.durationMinutes
  ) {
    return NextResponse.json(
      { message: 'Missing required fields.' },
      { status: 400 }
    )
  }

  const response = await fetch(
    `${apiBaseUrl}/lessons/${lessonId}/reschedule`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  )

  const responsePayload = await response.text()
  const parsed = parseBackendPayload(responsePayload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to reschedule lesson.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
