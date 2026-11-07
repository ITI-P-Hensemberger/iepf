import { NextResponse } from 'next/server'

import { backendFetch } from '@/lib/backend-fetch'
import { forwardToBackend } from '@/lib/backend-proxy'

// The FAQ is public: no session needed to read it.
export async function GET() {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const response = await backendFetch(`${apiBaseUrl}/faqs`, { cache: 'no-store' })
  return NextResponse.json(response.ok ? await response.json() : [], { status: response.ok ? 200 : response.status })
}

export async function POST(request: Request) {
  return forwardToBackend('/faqs', { method: 'POST', body: await request.text() })
}
