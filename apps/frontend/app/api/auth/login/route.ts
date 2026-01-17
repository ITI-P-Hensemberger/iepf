import { NextResponse } from 'next/server'

import { loginWithProfile } from '@/lib/auth'
import { setAuthCookies } from '@/lib/auth-cookies'

export async function POST(request: Request) {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:9999'

  let body: { email?: string; password?: string; remember?: boolean } | null =
    null

  try {
    body = (await request.json()) as {
      email?: string
      password?: string
      remember?: boolean
    }
  } catch (error) {
    return NextResponse.json(
      { message: 'Corpo richiesta non valido.' },
      { status: 400 }
    )
  }

  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { message: 'Email e password sono obbligatorie.' },
      { status: 400 }
    )
  }

  try {
    const { tokens, profile } = await loginWithProfile(
      apiBaseUrl,
      body.email,
      body.password
    )

    const response = NextResponse.json({
      role: profile.role ?? 'student',
      isActive: profile.isActive === true
    })

    setAuthCookies(response, tokens, Boolean(body.remember))

    return response
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status) {
      const message =
        status === 403 ? 'Email non verificata.' : 'Login fallito.'
      return NextResponse.json({ message }, { status })
    }

    return NextResponse.json(
      { message: 'Login fallito.' },
      { status: 500 }
    )
  }
}
