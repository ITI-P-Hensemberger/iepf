import { NextResponse } from 'next/server'

export async function GET() {
  const apiBaseUrl =
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:9999'

  const response = await fetch(`${apiBaseUrl}/class-sections`)

  if (!response.ok) {
    const message = await response.text()
    return NextResponse.json(
      { message: message || 'Failed to fetch class sections.' },
      { status: response.status }
    )
  }

  const data = await response.json()
  return NextResponse.json(data)
}
