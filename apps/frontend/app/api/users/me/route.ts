import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { AUTH_COOKIES, getUserIdFromToken } from '@/lib/auth'

type UpdateProfileBody = {
  firstName?: string
  lastName?: string
  email?: string
  sectionId?: string
  year?: number
}

export async function PATCH(request: Request) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const userId = getUserIdFromToken(accessToken)
  if (!userId) {
    return NextResponse.json({ message: 'Invalid token.' }, { status: 400 })
  }

  let body: UpdateProfileBody | null = null

  try {
    body = (await request.json()) as UpdateProfileBody
  } catch (error) {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  const payload: UpdateProfileBody = {}

  if (typeof body.firstName === 'string') {
    payload.firstName = body.firstName
  }
  if (typeof body.lastName === 'string') {
    payload.lastName = body.lastName
  }
  if (typeof body.email === 'string') {
    payload.email = body.email
  }
  if (typeof body.sectionId === 'string') {
    payload.sectionId = body.sectionId
  }
  if (typeof body.year === 'number' && Number.isFinite(body.year)) {
    payload.year = body.year
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ message: 'No valid fields.' }, { status: 400 })
  }

  const response = await fetch(`${apiBaseUrl}/users/${userId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const message = await response.text()
    return NextResponse.json(
      { message: message || 'Failed to update profile.' },
      { status: response.status }
    )
  }

  const data = await response.json()
  return NextResponse.json(data)
}
