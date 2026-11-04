import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'

import { AUTH_COOKIES } from '@/lib/auth'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ tutorId: string; subjectId: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { tutorId, subjectId } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const response = await backendFetch(
    `${apiBaseUrl}/tutors/${tutorId}/subjects/${subjectId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  )

  const payloadText = await response.text()
  const parsed = parseBackendPayload(payloadText)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to remove subject.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return new NextResponse(null, { status: 204 })
}
