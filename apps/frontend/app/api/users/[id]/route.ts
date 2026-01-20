import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'

import { AUTH_COOKIES } from '@/lib/auth'

type UpdateUserBody = {
  email?: string
  firstName?: string
  lastName?: string
  password?: string
  sectionId?: string
  year?: number
  isActive?: boolean
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { id } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const response = await fetch(`${apiBaseUrl}/users/${id}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to fetch user.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { id } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let body: UpdateUserBody | null = null

  try {
    body = (await request.json()) as UpdateUserBody
  } catch (error) {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  const payload: UpdateUserBody = {}

  if (typeof body.email === 'string') {
    payload.email = body.email
  }
  if (typeof body.firstName === 'string') {
    payload.firstName = body.firstName
  }
  if (typeof body.lastName === 'string') {
    payload.lastName = body.lastName
  }
  if (typeof body.password === 'string') {
    payload.password = body.password
  }
  if (typeof body.sectionId === 'string') {
    payload.sectionId = body.sectionId
  }
  if (typeof body.year === 'number' && Number.isFinite(body.year)) {
    payload.year = body.year
  }
  if (typeof body.isActive === 'boolean') {
    payload.isActive = body.isActive
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { message: 'No valid fields provided.' },
      { status: 400 }
    )
  }

  const response = await fetch(`${apiBaseUrl}/users/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const payloadText = await response.text()
  const parsed = parseBackendPayload(payloadText)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to update user.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { id } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const response = await fetch(`${apiBaseUrl}/users/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  const payloadText = await response.text()
  const parsed = parseBackendPayload(payloadText)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to delete user.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return new NextResponse(null, { status: 204 })
}
