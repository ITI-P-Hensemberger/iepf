import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? 'http://localhost:9999'

  let body: { email?: string } | null = null

  try {
    body = (await request.json()) as { email?: string }
  } catch (error) {
    return NextResponse.json(
      { message: 'Corpo richiesta non valido.' },
      { status: 400 }
    )
  }

  const response = await fetch(`${apiBaseUrl}/auth/password/reset/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const payload = await response.text()

  if (!response.ok) {
    return NextResponse.json(
      { message: payload || 'Richiesta non riuscita.' },
      { status: response.status }
    )
  }

  return NextResponse.json(payload ? JSON.parse(payload) : {})
}
