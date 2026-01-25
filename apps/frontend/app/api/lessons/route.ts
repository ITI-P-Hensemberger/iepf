import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

const LESSON_LIST_KEYS = ['data', 'items', 'results', 'rows'] as const

function normalizeLessonDailyFields(lesson: Record<string, unknown>) {
  if (
    lesson.dailyAvailability === undefined &&
    lesson.dailyCapacity !== undefined
  ) {
    return { ...lesson, dailyAvailability: lesson.dailyCapacity }
  }
  return lesson
}

function normalizeLessonList(items: unknown[]) {
  return items.map((item) => {
    if (!item || typeof item !== 'object') {
      return item
    }
    return normalizeLessonDailyFields(item as Record<string, unknown>)
  })
}

function normalizeLessonsPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload
  }
  if (Array.isArray(payload)) {
    return normalizeLessonList(payload)
  }

  const record = payload as Record<string, unknown>
  for (const key of LESSON_LIST_KEYS) {
    if (Array.isArray(record[key])) {
      return { ...record, [key]: normalizeLessonList(record[key] as unknown[]) }
    }
  }

  if (record.data && typeof record.data === 'object') {
    const nested = record.data as Record<string, unknown>
    for (const key of LESSON_LIST_KEYS) {
      if (Array.isArray(nested[key])) {
        return {
          ...record,
          data: { ...nested, [key]: normalizeLessonList(nested[key] as unknown[]) }
        }
      }
    }
    if ('id' in nested) {
      return { ...record, data: normalizeLessonDailyFields(nested) }
    }
  }

  if ('id' in record) {
    return normalizeLessonDailyFields(record)
  }

  return record
}

export async function GET(request: NextRequest) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const incomingUrl = new URL(request.url)
  const targetUrl = new URL(`${apiBaseUrl}/lessons`)
  targetUrl.search = incomingUrl.searchParams.toString()

  console.log('[BFF] GET /lessons request', {
    query: targetUrl.searchParams.toString()
  })
  const response = await fetch(targetUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  })

  const payload = await response.text()
  console.log('[BFF] GET /lessons response', {
    status: response.status,
    body: payload
  })
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to fetch lessons.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(normalizeLessonsPayload(parsed.data ?? {}))
}
