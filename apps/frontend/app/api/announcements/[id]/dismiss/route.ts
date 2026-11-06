import { forwardToBackend } from '@/lib/backend-proxy'

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return forwardToBackend(`/announcements/${encodeURIComponent(id)}/dismiss`, { method: 'POST' })
}
