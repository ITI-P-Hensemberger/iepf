import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES } from '@/lib/auth'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { id } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let body: { isActive?: boolean } | null = null

  try {
    body = (await request.json()) as { isActive?: boolean }
  } catch (error) {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  if (typeof body.isActive !== 'boolean') {
    return NextResponse.json(
      { message: 'Missing isActive value.' },
      { status: 400 }
    )
  }

  const response = await fetch(`${apiBaseUrl}/users/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ isActive: body.isActive })
  })

  if (!response.ok) {
    const message = await response.text()
    return NextResponse.json(
      { message: message || 'Failed to update user.' },
      { status: response.status }
    )
  }

  const data = await response.json()
  return NextResponse.json(data)
}
