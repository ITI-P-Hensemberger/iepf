import { forwardToBackend } from '@/lib/backend-proxy'

// The history of a feedback: for its author (without names) and for the admins.
export async function GET(
  _request: Request,
  context: { params: Promise<{ feedbackId: string }> }
) {
  const { feedbackId } = await context.params
  return forwardToBackend(`/feedback/${encodeURIComponent(feedbackId)}/history`)
}
