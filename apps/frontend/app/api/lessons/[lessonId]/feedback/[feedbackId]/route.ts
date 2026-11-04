import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

type LessonFeedbackUpdateBody = {
  rating?: number
  text?: string
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string; feedbackId: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { lessonId, feedbackId } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<LessonFeedbackUpdateBody> | null = null

  try {
    body = (await request.json()) as Partial<LessonFeedbackUpdateBody>
  } catch {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  const ratingValue =
    typeof body.rating === 'number' ? Math.round(body.rating) : undefined
  const textValue =
    typeof body.text === 'string' ? body.text.trim() : undefined

  if (
    ratingValue === undefined &&
    (textValue === undefined || textValue.length === 0)
  ) {
    return NextResponse.json(
      { message: 'Invalid feedback update payload.' },
      { status: 400 }
    )
  }

  if (ratingValue !== undefined && (ratingValue < 1 || ratingValue > 5)) {
    return NextResponse.json(
      { message: 'Invalid rating value.' },
      { status: 400 }
    )
  }

  if (textValue !== undefined && textValue.length === 0) {
    return NextResponse.json(
      { message: 'Invalid text value.' },
      { status: 400 }
    )
  }

  const requestBody: LessonFeedbackUpdateBody = {}
  if (ratingValue !== undefined) {
    requestBody.rating = ratingValue
  }
  if (textValue !== undefined) {
    requestBody.text = textValue
  }

  const response = await backendFetch(
    `${apiBaseUrl}/lessons/${lessonId}/feedback/${feedbackId}`,
    {
      method: 'PATCH',
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
        message: parsed.errorMessage || 'Failed to update feedback.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
