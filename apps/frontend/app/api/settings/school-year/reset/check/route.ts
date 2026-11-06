import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES } from '@/lib/auth'
import { backendFetch } from '@/lib/backend-fetch'
import { parseBackendPayload } from '@/lib/backend-response'

// The first confirmation of the reset: checks password and report, deletes nothing.
export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIES.access)?.value
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  const response = await backendFetch(`${process.env.API_BASE_URL ?? 'http://localhost:9999'}/settings/school-year/reset/check`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: await request.text()
  })
  if (response.status === 204) return new NextResponse(null, { status: 204 })
  const parsed = parseBackendPayload(await response.text())
  return NextResponse.json({ message: parsed.errorMessage || 'Verifica non riuscita.' }, { status: response.status })
}
