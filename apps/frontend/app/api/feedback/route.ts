import { forwardToBackend } from '@/lib/backend-proxy'
import { NextResponse, type NextRequest } from 'next/server'

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

  const incomingUrl = new URL(request.url)
  const targetParams = new URLSearchParams()
  const incomingParams = incomingUrl.searchParams
  const passthroughKeys = [
    'q',
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
    'includeDeleted',
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
    feedbackQ: 'q',
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

  return forwardToBackend(`/feedback?${targetParams}`)
}

export async function POST(request: Request) {

  let body: Partial<FeedbackCreateBody> | null = null

  try {
    body = (await request.json()) as Partial<FeedbackCreateBody>
  } catch {
    return NextResponse.json({ message: 'Corpo richiesta non valido.' }, { status: 400 })
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
    return NextResponse.json({ message: 'Dati del feedback non validi.' }, { status: 400 })
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

  return forwardToBackend(`/feedback`, { method: 'POST', body: JSON.stringify(requestBody) })
}
