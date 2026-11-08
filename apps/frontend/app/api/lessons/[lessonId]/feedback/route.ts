import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

type LessonFeedbackCreateBody = {
  bookingId: string
  rating: number
  text?: string
}

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await context.params

  let body: Partial<LessonFeedbackCreateBody> | null = null

  try {
    body = (await request.json()) as Partial<LessonFeedbackCreateBody>
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
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
      { message: 'Dati del feedback non validi.' },
      { status: 400 }
    )
  }

  if (textValue !== undefined && textValue.length === 0) {
    return NextResponse.json(
      { message: 'Dati del feedback non validi.' },
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

  return forwardToBackend(`/lessons/${lessonId}/feedback`, { method: 'POST', body: JSON.stringify(requestBody) })
}
