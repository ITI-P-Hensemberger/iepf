import { forwardToBackend } from '@/lib/backend-proxy'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  return forwardToBackend(`/users/${id}/activation-history`)
}
