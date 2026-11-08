import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {

  return forwardToBackend(`/lessons${new URL(request.url).search}`)
}

type CreateLessonBody = {
  tutorId: string
  // null or missing: an open lesson, whose first booking picks the subject.
  subjectId: string | null
  startAt: string
  durationMinutes: number
}

export async function POST(request: Request) {

  let body: Partial<CreateLessonBody> | null = null

  try {
    body = (await request.json()) as Partial<CreateLessonBody>
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  const payload: Partial<CreateLessonBody> = {}

  if (typeof body.tutorId === 'string') {
    payload.tutorId = body.tutorId
  }
  if (typeof body.subjectId === 'string' || body.subjectId === null) {
    payload.subjectId = body.subjectId
  }
  if (typeof body.startAt === 'string') {
    payload.startAt = body.startAt
  }
  if (typeof body.durationMinutes === 'number') {
    payload.durationMinutes = body.durationMinutes
  }
  if (
    !payload.tutorId ||
    !payload.startAt ||
    !payload.durationMinutes
  ) {
    return NextResponse.json(
      { message: 'Compila i campi obbligatori.' },
      { status: 400 }
    )
  }

  return forwardToBackend(`/lessons`, { method: 'POST', body: JSON.stringify(payload) })
}
