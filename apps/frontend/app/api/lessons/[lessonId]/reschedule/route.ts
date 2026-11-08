import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

type RescheduleBody = {
  tutorId: string
  // null keeps the lesson open: its bookings choose the subject.
  subjectId: string | null
  startAt: string
  durationMinutes: number
}

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await context.params

  let body: Partial<RescheduleBody> | null = null

  try {
    body = (await request.json()) as Partial<RescheduleBody>
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  const payload: Partial<RescheduleBody> = {}

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
    payload.subjectId === undefined ||
    !payload.startAt ||
    !payload.durationMinutes
  ) {
    return NextResponse.json(
      { message: 'Compila i campi obbligatori.' },
      { status: 400 }
    )
  }

  return forwardToBackend(`/lessons/${lessonId}/reschedule`, { method: 'POST', body: JSON.stringify(payload) })
}
