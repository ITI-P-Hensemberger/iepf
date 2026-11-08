import { forwardToBackend } from '@/lib/backend-proxy'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  return forwardToBackend(`/subjects/${id}`)
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const bodyText = await request.text()

  return forwardToBackend(`/subjects/${id}`, { method: 'PATCH', body: bodyText })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  return forwardToBackend(`/subjects/${id}`, { method: 'DELETE' })
}
