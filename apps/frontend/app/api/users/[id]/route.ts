import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

type UpdateUserBody = {
  email?: string
  firstName?: string
  lastName?: string
  sectionId?: string
  year?: number
  isActive?: boolean
  deactivationReason?: string
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  return forwardToBackend(`/users/${id}`)
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  let body: UpdateUserBody | null = null

  try {
    body = (await request.json()) as UpdateUserBody
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
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
  if (typeof body.sectionId === 'string') {
    payload.sectionId = body.sectionId
  }
  if (typeof body.year === 'number' && Number.isFinite(body.year)) {
    payload.year = body.year
  }
  if (typeof body.isActive === 'boolean') {
    payload.isActive = body.isActive
  }
  if (body.isActive === false && typeof body.deactivationReason === 'string') {
    payload.deactivationReason = body.deactivationReason
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { message: 'Nessun campo da aggiornare.' },
      { status: 400 }
    )
  }

  return forwardToBackend(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  // The admin's own password, which the backend checks before deleting.
  const body = await request.text()
  return forwardToBackend(`/users/${id}`, { method: 'DELETE', body: body || '{}' })
}
