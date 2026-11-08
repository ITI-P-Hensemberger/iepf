import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse } from 'next/server'

type AdjustTokensBody = {
  delta?: number
  reason?: string
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  let body: AdjustTokensBody | null = null

  try {
    body = (await request.json()) as AdjustTokensBody
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
  }

  if (
    !body
    || typeof body.delta !== 'number'
    || !Number.isInteger(body.delta)
    || typeof body.reason !== 'string'
    || body.reason.trim().length === 0
  ) {
    return NextResponse.json(
      { message: 'Indica un numero intero di crediti e un motivo.' },
      { status: 400 }
    )
  }

  return forwardToBackend(`/students/${id}/tokens/adjust`, { method: 'POST', body: JSON.stringify({ delta: body.delta, reason: body.reason.trim() }) })
}
