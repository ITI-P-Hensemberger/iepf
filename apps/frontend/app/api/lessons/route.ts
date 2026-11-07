import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import type { ApiResponse } from '@/lib/api'
import { AUTH_COOKIES } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const incomingUrl = new URL(request.url)
  const targetUrl = new URL(`${apiBaseUrl}/lessons`)
  targetUrl.search = incomingUrl.searchParams.toString()

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

  return NextResponse.json(parsed.data as ApiResponse<'/lessons'>)
}

type CreateLessonBody = {
  tutorId: string
  // null or missing: an open lesson, whose first booking picks the subject.
  subjectId: string | null
  startAt: string
  durationMinutes: number
}

export async function POST(request: Request) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<CreateLessonBody> | null = null

  try {
    body = (await request.json()) as Partial<CreateLessonBody>
  } catch {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  const payload: Partial<CreateLessonBody> = {}

  if (typeof body.tutorId === 'string') {
    payload.tutorId = body.tutorId
  }
  if (typeof body.subjectId === 'string' || body.subjectId === null) {
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
    !payload.startAt ||
    !payload.durationMinutes
  ) {
    return NextResponse.json(
      { message: 'Missing required fields.' },
      { status: 400 }
    )
  }

  const response = await backendFetch(`${apiBaseUrl}/lessons`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const responsePayload = await response.text()
  const parsed = parseBackendPayload(responsePayload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to create lesson.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
