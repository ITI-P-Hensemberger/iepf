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

  const response = await backendFetch(`${apiBaseUrl}/tutors/${tutorId}/subjects`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to fetch tutor subjects.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? [])
}

type AssignSubjectBody = {
  subjectId?: string
}

export async function POST(
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

  let body: AssignSubjectBody | null = null

  try {
    body = (await request.json()) as AssignSubjectBody
  } catch {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  if (typeof body.subjectId !== 'string' || !body.subjectId) {
    return NextResponse.json(
      { message: 'subjectId is required.' },
      { status: 400 }
    )
  }

  const response = await backendFetch(`${apiBaseUrl}/tutors/${tutorId}/subjects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ subjectId: body.subjectId })
  })

  const payloadText = await response.text()
  const parsed = parseBackendPayload(payloadText)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to assign subject.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
