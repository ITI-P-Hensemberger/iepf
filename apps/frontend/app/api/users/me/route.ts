import { forwardToBackend } from '@/lib/backend-proxy'
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
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Sessione scaduta. Accedi di nuovo.' }, { status: 401 })
  }

  const userId = getUserIdFromToken(accessToken)
  if (!userId) {
    return NextResponse.json({ message: 'Sessione non valida. Accedi di nuovo.' }, { status: 400 })
  }

  let body: UpdateProfileBody | null = null

  try {
    body = (await request.json()) as UpdateProfileBody
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
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
    return NextResponse.json({ message: 'Nessun campo da aggiornare.' }, { status: 400 })
  }

  return forwardToBackend(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}
