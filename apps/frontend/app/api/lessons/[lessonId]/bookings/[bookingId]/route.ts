import { forwardToBackend } from '@/lib/backend-proxy'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ lessonId: string; bookingId: string }> }
) {
  const { lessonId, bookingId } = await context.params

  return forwardToBackend(`/lessons/${lessonId}/bookings/${bookingId}`, { method: 'DELETE' })
}
