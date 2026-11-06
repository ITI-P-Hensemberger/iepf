import { forwardToBackend } from '@/lib/backend-proxy'

type Context = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params
  return forwardToBackend(`/notifications/inbox/${encodeURIComponent(id)}/read`, { method: 'POST' })
}
