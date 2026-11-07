import { forwardToBackend } from '@/lib/backend-proxy'

type Context = { params: Promise<{ id: string }> }

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params
  return forwardToBackend(`/faqs/${encodeURIComponent(id)}`, { method: 'PUT', body: await request.text() })
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params
  return forwardToBackend(`/faqs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
