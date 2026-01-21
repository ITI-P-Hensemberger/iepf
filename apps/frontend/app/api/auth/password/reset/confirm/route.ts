import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'

export async function POST(request: Request) {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'

  let body: { token?: string; password?: string } | null = null

  try {
    body = (await request.json()) as { token?: string; password?: string }
  } catch {
    return NextResponse.json(
      { message: 'Corpo richiesta non valido.' },
      { status: 400 }
    )
  }

  const response = await fetch(`${apiBaseUrl}/auth/password/reset/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Reset non riuscito.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
