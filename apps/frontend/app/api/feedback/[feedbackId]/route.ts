import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

type FeedbackUpdateBody = {
  rating?: number
  text?: string
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ feedbackId: string }> }
) {
  const { feedbackId } = await context.params

  return forwardToBackend(`/feedback/${feedbackId}`)
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ feedbackId: string }> }
) {
  const { feedbackId } = await context.params

  let body: Partial<FeedbackUpdateBody> | null = null

  try {
    body = (await request.json()) as Partial<FeedbackUpdateBody>
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
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
      { message: 'Dati del feedback non validi.' },
      { status: 400 }
    )
  }

  if (ratingValue !== undefined && (ratingValue < 1 || ratingValue > 5)) {
    return NextResponse.json(
      { message: 'Valutazione non valida.' },
      { status: 400 }
    )
  }

  if (textValue !== undefined && textValue.length === 0) {
    return NextResponse.json(
      { message: 'Testo non valido.' },
      { status: 400 }
    )
  }

  const requestBody: FeedbackUpdateBody = {}
  if (ratingValue !== undefined) {
    requestBody.rating = ratingValue
  }
  if (textValue !== undefined) {
    requestBody.text = textValue
  }

  return forwardToBackend(`/feedback/${feedbackId}`, { method: 'PATCH', body: JSON.stringify(requestBody) })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ feedbackId: string }> }
) {
  const { feedbackId } = await context.params

  return forwardToBackend(`/feedback/${feedbackId}`, { method: 'DELETE' })
}
