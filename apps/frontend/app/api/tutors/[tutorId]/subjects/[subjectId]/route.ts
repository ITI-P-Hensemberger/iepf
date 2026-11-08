import { forwardToBackend } from '@/lib/backend-proxy'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ tutorId: string; subjectId: string }> }
) {
  const { tutorId, subjectId } = await context.params

  return forwardToBackend(`/tutors/${tutorId}/subjects/${subjectId}`, { method: 'DELETE' })
}
