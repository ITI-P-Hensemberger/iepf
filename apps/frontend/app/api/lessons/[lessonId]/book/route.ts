import { forwardToBackend } from '@/lib/backend-proxy'

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await context.params

  const payload = await request.text()
  return forwardToBackend(`/lessons/${lessonId}/book`, { method: 'POST', body: payload })
}
