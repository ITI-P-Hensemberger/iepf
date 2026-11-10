import { forwardToBackend } from '@/lib/backend-proxy'

type Context = { params: Promise<{ lessonId: string, bookingId: string }> }

export async function POST(_request: Request, context: Context) {
  const { lessonId, bookingId } = await context.params
  return forwardToBackend(`/lessons/${encodeURIComponent(lessonId)}/bookings/${encodeURIComponent(bookingId)}/messages/read`, { method: 'POST' })
}
