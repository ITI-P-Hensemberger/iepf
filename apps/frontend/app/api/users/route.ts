import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES } from '@/lib/auth'

export async function GET() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const response = await fetch(`${apiBaseUrl}/users`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    const message = await response.text()
    return NextResponse.json(
      { message: message || 'Failed to fetch users.' },
      { status: response.status }
    )
  }

  const data = await response.json()
  return NextResponse.json(data)
}
