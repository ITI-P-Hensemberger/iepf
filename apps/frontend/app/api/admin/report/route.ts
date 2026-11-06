import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES } from '@/lib/auth'
import { backendFetch } from '@/lib/backend-fetch'
import { parseBackendPayload } from '@/lib/backend-response'

// The year report is a binary .xlsx: passed through as it is, with its file name.
export async function GET() {
  const accessToken = (await cookies()).get(AUTH_COOKIES.access)?.value
  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }
  const response = await backendFetch(`${process.env.API_BASE_URL ?? 'http://localhost:9999'}/admin/stats/report`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store'
  })
  if (!response.ok) {
    const parsed = parseBackendPayload(await response.text())
    return NextResponse.json({ message: parsed.errorMessage || 'Report non disponibile.' }, { status: response.status })
  }
  return new NextResponse(response.body, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': response.headers.get('content-disposition') ?? 'attachment; filename="iepf-report.xlsx"',
      'Cache-Control': 'no-store'
    }
  })
}
