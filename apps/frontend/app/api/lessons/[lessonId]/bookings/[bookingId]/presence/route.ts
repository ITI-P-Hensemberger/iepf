import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

type PresenceBody = {
  present: boolean | null
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string; bookingId: string }> }
) {
  const { lessonId, bookingId } = await context.params

  let body: Partial<PresenceBody> | null = null

  try {
    body = (await request.json()) as Partial<PresenceBody>
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  if (body.present !== null && typeof body.present !== 'boolean') {
    return NextResponse.json(
      { message: 'Valore di presenza non valido.' },
      { status: 400 }
    )
  }

  return forwardToBackend(`/lessons/${lessonId}/bookings/${bookingId}/presence`, { method: 'PATCH', body: JSON.stringify({ present: body.present }) })
}
