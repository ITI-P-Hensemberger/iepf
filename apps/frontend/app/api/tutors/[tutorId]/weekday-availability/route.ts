import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'

import { AUTH_COOKIES } from '@/lib/auth'

export async function GET(
  _request: Request,
  context: { params: Promise<{ tutorId: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { tutorId } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const response = await backendFetch(
    `${apiBaseUrl}/tutors/${tutorId}/weekday-availability`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  )

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to fetch weekday availability.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? [])
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
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { tutorId } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let body: WeekdayAvailabilityBody | null = null

  try {
    body = (await request.json()) as WeekdayAvailabilityBody
  } catch {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  if (!Array.isArray(body.weekdays)) {
    return NextResponse.json(
      { message: 'weekdays array is required.' },
      { status: 400 }
    )
  }

  const response = await backendFetch(
    `${apiBaseUrl}/tutors/${tutorId}/weekday-availability`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ weekdays: body.weekdays })
    }
  )

  const payloadText = await response.text()
  const parsed = parseBackendPayload(payloadText)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to update weekday availability.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
