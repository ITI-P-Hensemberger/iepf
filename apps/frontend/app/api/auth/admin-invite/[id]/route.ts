import { forwardToBackend } from '@/lib/backend-proxy'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  return forwardToBackend(`/auth/admin-invite/${id}`, { method: 'DELETE' })
}
