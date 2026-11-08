import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  context: { params: Promise<{ tutorId: string }> }
) {
  const { tutorId } = await context.params

  return forwardToBackend(`/tutors/${tutorId}/weekday-availability`)
}

type WeekdayAvailabilityBody = {
  weekdays?: Array<{
    weekday: number
    isAvailable: boolean
    startTime: '14:00' | '15:00' | null
  }>
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ tutorId: string }> }
) {
  const { tutorId } = await context.params

  let body: WeekdayAvailabilityBody | null = null

  try {
    body = (await request.json()) as WeekdayAvailabilityBody
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  if (!Array.isArray(body.weekdays)) {
    return NextResponse.json(
      { message: 'weekdays array is required.' },
      { status: 400 }
    )
  }

  return forwardToBackend(`/tutors/${tutorId}/weekday-availability`, { method: 'PUT', body: JSON.stringify({ weekdays: body.weekdays }) })
}
