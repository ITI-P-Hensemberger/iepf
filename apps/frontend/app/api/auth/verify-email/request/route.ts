import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'

export async function POST(request: Request) {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'

  let body: { email?: string } | null = null

  try {
    body = (await request.json()) as { email?: string }
  } catch {
    return NextResponse.json(
      { message: 'Corpo richiesta non valido.' },
      { status: 400 }
    )
  }

  const response = await fetch(`${apiBaseUrl}/auth/verify-email/request`, {
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
        message: parsed.errorMessage || 'Richiesta non riuscita.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
