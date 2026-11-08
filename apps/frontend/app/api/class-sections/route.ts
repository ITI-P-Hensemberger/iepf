import { backendFetch } from '@/lib/backend-fetch'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'

export async function GET() {
  const apiBaseUrl =
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:9999'

  const response = await backendFetch(`${apiBaseUrl}/class-sections`)

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Impossibile caricare le classi.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
