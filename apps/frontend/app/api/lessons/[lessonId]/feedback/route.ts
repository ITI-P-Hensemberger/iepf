import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

type LessonFeedbackCreateBody = {
  bookingId: string
  rating: number
  text?: string
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

  let body: Partial<LessonFeedbackCreateBody> | null = null

  try {
    body = (await request.json()) as Partial<LessonFeedbackCreateBody>
  } catch {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  const ratingValue =
    typeof body.rating === 'number' ? Math.round(body.rating) : null
  const textValue =
    typeof body.text === 'string' ? body.text.trim() : undefined

  if (
    typeof body.bookingId !== 'string' ||
    !ratingValue ||
    ratingValue < 1 ||
    ratingValue > 5
  ) {
    return NextResponse.json(
      { message: 'Invalid feedback payload.' },
      { status: 400 }
    )
  }

  if (textValue !== undefined && textValue.length === 0) {
    return NextResponse.json(
      { message: 'Invalid feedback payload.' },
      { status: 400 }
    )
  }

  const requestBody: LessonFeedbackCreateBody = {
    bookingId: body.bookingId,
    rating: ratingValue
  }

  if (textValue) {
    requestBody.text = textValue
  }

  const response = await fetch(
    `${apiBaseUrl}/lessons/${lessonId}/feedback`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }
  )

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to create feedback.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
