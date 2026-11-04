import { backendFetch } from '@/lib/backend-fetch'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { parseBackendPayload } from '@/lib/backend-response'
import { AUTH_COOKIES } from '@/lib/auth'

type FeedbackCreateBody = {
  lessonId: string
  bookingId: string
  authorUserId: string
  targetUserId: string
  authorRole: 'student' | 'tutor'
  rating: number
  text?: string
}

export async function GET(request: NextRequest) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const incomingUrl = new URL(request.url)
  const targetUrl = new URL(`${apiBaseUrl}/feedback`)
  const targetParams = new URLSearchParams()
  const incomingParams = incomingUrl.searchParams
  const passthroughKeys = [
    'lessonId',
    'bookingId',
    'authorUserId',
    'targetUserId',
    'authorRole',
    'rating',
    'lessonFrom',
    'lessonTo',
    'from',
    'to',
    'limit',
    'offset'
  ]

  passthroughKeys.forEach((key) => {
    const value = incomingParams.get(key)
    if (value) {
      targetParams.set(key, value)
    }
  })

  const mappedParams: Record<string, string> = {
    feedbackLesson: 'lessonId',
    feedbackAuthor: 'authorUserId',
    feedbackTarget: 'targetUserId',
    feedbackRole: 'authorRole',
    feedbackRating: 'rating',
    feedbackLessonFrom: 'lessonFrom',
    feedbackLessonTo: 'lessonTo',
    feedbackFrom: 'from',
    feedbackTo: 'to'
  }

  Object.entries(mappedParams).forEach(([fromKey, toKey]) => {
    const value = incomingParams.get(fromKey)
    if (value) {
      targetParams.set(toKey, value)
    }
  })

  const allowedSortBy = new Set(['createdAt', 'lessonStartAt', 'rating'])
  const normalizeSortBy = (value: string | null) => {
    if (!value) return null
    if (allowedSortBy.has(value)) return value
    return null
  }

  let sortBy = normalizeSortBy(incomingParams.get('sortBy'))
  let sortDir = incomingParams.get('sortDir')

  if (!sortBy) {
    const sortParam = incomingParams.get('feedbackSort')
    if (sortParam) {
      const [rawSortBy, rawSortDir] = sortParam.split(':')
      sortBy = normalizeSortBy(rawSortBy)
      sortDir = rawSortDir
    }
  }

  if (sortBy) {
    targetParams.set('sortBy', sortBy)
    if (sortDir) {
      targetParams.set('sortDir', sortDir)
    }
  }

  targetUrl.search = targetParams.toString()

  const response = await backendFetch(targetUrl.toString(), {
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
        message: parsed.errorMessage || 'Failed to fetch feedback.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}

export async function POST(request: Request) {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value

  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<FeedbackCreateBody> | null = null

  try {
    body = (await request.json()) as Partial<FeedbackCreateBody>
  } catch {
    return NextResponse.json({ message: 'Invalid body.' }, { status: 400 })
  }

  const ratingValue =
    typeof body.rating === 'number' ? Math.round(body.rating) : null
  const textValue =
    typeof body.text === 'string' ? body.text.trim() : undefined

  if (
    typeof body.lessonId !== 'string' ||
    typeof body.bookingId !== 'string' ||
    typeof body.authorUserId !== 'string' ||
    typeof body.targetUserId !== 'string' ||
    (body.authorRole !== 'student' && body.authorRole !== 'tutor') ||
    !ratingValue ||
    ratingValue < 1 ||
    ratingValue > 5
  ) {
    return NextResponse.json({ message: 'Invalid feedback payload.' }, { status: 400 })
  }

  const requestBody: FeedbackCreateBody = {
    lessonId: body.lessonId,
    bookingId: body.bookingId,
    authorUserId: body.authorUserId,
    targetUserId: body.targetUserId,
    authorRole: body.authorRole,
    rating: ratingValue
  }

  if (textValue) {
    requestBody.text = textValue
  }

  const response = await backendFetch(`${apiBaseUrl}/feedback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  const payload = await response.text()
  const parsed = parseBackendPayload(payload)

  if (!response.ok) {
    return NextResponse.json(
      {
        message: parsed.errorMessage || 'Failed to create feedback.',
        error: parsed.errorPayload
      },
      { status: response.status }
    )
  }

  return NextResponse.json(parsed.data ?? {})
}
