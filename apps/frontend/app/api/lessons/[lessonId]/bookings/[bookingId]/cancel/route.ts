import { forwardToBackend } from '@/lib/backend-proxy'

type CancelBody = {
  countsForStudent?: boolean
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string; bookingId: string }> }
) {
  const { lessonId, bookingId } = await context.params

  let body: Partial<CancelBody> | null = null

  try {
    body = (await request.json()) as Partial<CancelBody>
  } catch {
    body = null
  }

  const payload: Partial<CancelBody> = {}
  if (typeof body?.countsForStudent === 'boolean') {
    payload.countsForStudent = body.countsForStudent
  }

  return forwardToBackend(`/lessons/${lessonId}/bookings/${bookingId}/cancel`, { method: 'PATCH', body: JSON.stringify(payload) })
}
