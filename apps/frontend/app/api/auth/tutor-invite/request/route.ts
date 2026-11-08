import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {

  let body: { email?: string } | null = null

  try {
    body = (await request.json()) as { email?: string }
  } catch {
    return NextResponse.json(
      { message: 'Corpo richiesta non valido.' },
      { status: 400 }
    )
  }

  return forwardToBackend(`/auth/tutor-invite`, { method: 'POST', body: JSON.stringify(body) })
}
