import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:9999'

  let body: { token?: string; password?: string } | null = null

  try {
    body = (await request.json()) as { token?: string; password?: string }
  } catch (error) {
    return NextResponse.json(
      { message: 'Corpo richiesta non valido.' },
      { status: 400 }
    )
  }

  const response = await fetch(`${apiBaseUrl}/auth/password/reset/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const payload = await response.text()

  if (!response.ok) {
    return NextResponse.json(
      { message: payload || 'Reset non riuscito.' },
      { status: response.status }
    )
  }

  return NextResponse.json(payload ? JSON.parse(payload) : {})
}
