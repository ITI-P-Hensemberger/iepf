import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { path } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const search = url.search ? url.search : ''
  const targetPath = path.join('/')

  const response = await fetch(`${apiBaseUrl}/admin/stats/${targetPath}${search}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  })

  const payloadText = await response.text()
  const parsed = parseBackendPayload(payloadText)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to fetch admin stats.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? [])
}
