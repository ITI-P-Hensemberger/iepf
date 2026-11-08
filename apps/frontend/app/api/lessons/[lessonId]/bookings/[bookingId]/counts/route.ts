import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

type CountsBody = {
  countsForStudent: boolean
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string; bookingId: string }> }
) {
  const { lessonId, bookingId } = await context.params

  let body: Partial<CountsBody> | null = null

  try {
    body = (await request.json()) as Partial<CountsBody>
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  if (typeof body.countsForStudent !== 'boolean') {
    return NextResponse.json(
      { message: 'Valore non valido.' },
      { status: 400 }
    )
  }

  return forwardToBackend(`/lessons/${lessonId}/bookings/${bookingId}/counts`, { method: 'PATCH', body: JSON.stringify({ countsForStudent: body.countsForStudent }) })
}
