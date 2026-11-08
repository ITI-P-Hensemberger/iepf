import { forwardToBackend } from '@/lib/backend-proxy'

export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await context.params

  return forwardToBackend(`/lessons/${lessonId}`)
}
