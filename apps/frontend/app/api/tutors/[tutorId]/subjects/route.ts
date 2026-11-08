import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  context: { params: Promise<{ tutorId: string }> }
) {
  const { tutorId } = await context.params

  return forwardToBackend(`/tutors/${tutorId}/subjects`)
}

type AssignSubjectBody = {
  subjectId?: string
}

export async function POST(
  request: Request,
  context: { params: Promise<{ tutorId: string }> }
) {
  const { tutorId } = await context.params

  let body: AssignSubjectBody | null = null

  try {
    body = (await request.json()) as AssignSubjectBody
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  if (typeof body.subjectId !== 'string' || !body.subjectId) {
    return NextResponse.json(
      { message: 'subjectId is required.' },
      { status: 400 }
    )
  }

  return forwardToBackend(`/tutors/${tutorId}/subjects`, { method: 'POST', body: JSON.stringify({ subjectId: body.subjectId }) })
}
