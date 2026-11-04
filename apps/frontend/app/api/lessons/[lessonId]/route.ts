import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

function normalizeLessonDailyFields(lesson: Record<string, unknown>) {
  if (
    lesson.dailyAvailability === undefined &&
    lesson.dailyCapacity !== undefined
  ) {
    return { ...lesson, dailyAvailability: lesson.dailyCapacity }
  }
  return lesson
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value
  const { lessonId } = await context.params

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const response = await backendFetch(`${apiBaseUrl}/lessons/${lessonId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  })

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to fetch lesson.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  if (parsed.data && typeof parsed.data === 'object') {
    return NextResponse.json(
      normalizeLessonDailyFields(parsed.data as Record<string, unknown>)
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
