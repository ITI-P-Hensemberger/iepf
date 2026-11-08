import { forwardToBackend } from '@/lib/backend-proxy'

type CancelBody = {
  countsForTutor?: boolean
}

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await context.params

  let body: Partial<CancelBody> | null = null

  try {
    body = (await request.json()) as Partial<CancelBody>
  } catch {
    body = null
  }

  const payload: Partial<CancelBody> = {}
  if (typeof body?.countsForTutor === 'boolean') {
    payload.countsForTutor = body.countsForTutor
  }

  return forwardToBackend(`/lessons/${lessonId}/cancel`, { method: 'POST', body: JSON.stringify(payload) })
}
