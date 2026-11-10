import { forwardToBackend } from '@/lib/backend-proxy'

type Context = { params: Promise<{ lessonId: string, bookingId: string }> }

export async function GET(_request: Request, context: Context) {
  const { lessonId, bookingId } = await context.params
  return forwardToBackend(`/lessons/${encodeURIComponent(lessonId)}/bookings/${encodeURIComponent(bookingId)}/messages`)
}

export async function POST(request: Request, context: Context) {
  const { lessonId, bookingId } = await context.params
  return forwardToBackend(`/lessons/${encodeURIComponent(lessonId)}/bookings/${encodeURIComponent(bookingId)}/messages`, { method: 'POST', body: await request.text() })
}
