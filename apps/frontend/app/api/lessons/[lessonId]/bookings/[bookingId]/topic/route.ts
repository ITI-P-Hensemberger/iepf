import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

type TopicBody = {
  topic: string
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string; bookingId: string }> }
) {
  const { lessonId, bookingId } = await context.params

  let body: Partial<TopicBody> | null = null

  try {
    body = (await request.json()) as Partial<TopicBody>
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  if (typeof body.topic !== 'string' || !body.topic.trim()) {
    return NextResponse.json({ message: 'Argomento non valido.' }, { status: 400 })
  }

  return forwardToBackend(`/lessons/${lessonId}/bookings/${bookingId}/topic`, { method: 'PATCH', body: JSON.stringify({ topic: body.topic }) })
}
