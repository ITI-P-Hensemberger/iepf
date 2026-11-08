import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

type TutorSettingsBody = {
  dailyCapacity?: number
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ tutorId: string }> }
) {
  const { tutorId } = await context.params

  return forwardToBackend(`/tutors/${tutorId}/settings`)
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ tutorId: string }> }
) {
  const { tutorId } = await context.params

  let body: TutorSettingsBody | null = null

  try {
    body = (await request.json()) as TutorSettingsBody
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  return forwardToBackend(`/tutors/${tutorId}/settings`, { method: 'PUT', body: JSON.stringify({ dailyCapacity: body.dailyCapacity }) })
}
