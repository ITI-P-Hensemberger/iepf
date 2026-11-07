import { forwardToBackend } from '@/lib/backend-proxy'

// The hours an admin changed by hand for this student.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return forwardToBackend(`/students/${encodeURIComponent(id)}/tokens/history`)
}
