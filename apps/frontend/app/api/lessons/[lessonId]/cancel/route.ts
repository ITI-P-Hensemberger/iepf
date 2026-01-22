import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

type CancelBody = {
  countsForTutor?: boolean
}

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { lessonId } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

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

  const response = await fetch(`${apiBaseUrl}/lessons/${lessonId}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const responsePayload = await response.text()
  const parsed = parseBackendPayload(responsePayload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to cancel lesson.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
