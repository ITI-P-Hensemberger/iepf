import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

type AdjustTokensBody = {
  delta?: number
  reason?: string
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { id } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let body: AdjustTokensBody | null = null

  try {
    body = (await request.json()) as AdjustTokensBody
  } catch {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  if (
    !body
    || typeof body.delta !== 'number'
    || !Number.isInteger(body.delta)
    || typeof body.reason !== 'string'
    || body.reason.trim().length === 0
  ) {
    return NextResponse.json(
      { message: 'Invalid token adjustment payload.' },
      { status: 400 }
    )
  }

  const response = await backendFetch(`${apiBaseUrl}/students/${id}/tokens/adjust`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      delta: body.delta,
      reason: body.reason.trim()
    })
  })

  const payloadText = await response.text()
  const parsed = parseBackendPayload(payloadText)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to adjust tokens.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
