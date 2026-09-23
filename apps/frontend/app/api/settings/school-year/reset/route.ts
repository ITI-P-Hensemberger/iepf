import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES } from '@/lib/auth'
import { parseBackendPayload } from '@/lib/backend-response'

export async function POST(request: Request) {
  const token = (await cookies()).get(AUTH_COOKIES.access)?.value
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  const response = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:9999'}/settings/school-year/reset`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: await request.text()
  })
  const parsed = parseBackendPayload(await response.text())
  return NextResponse.json(parsed.data ?? { message: parsed.errorMessage }, { status: response.status })
}
