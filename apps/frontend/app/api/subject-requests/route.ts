import { forwardToBackend } from '@/lib/backend-proxy'
import type { NextRequest } from 'next/server'

const allowedQueryKeys = [
  'q',
  'studentId',
  'subjectId',
  'mode',
  'sortBy',
  'sortDir',
  'limit',
  'offset'
]

export async function GET(request: NextRequest) {

  const incomingUrl = new URL(request.url)
  const targetParams = new URLSearchParams()

  allowedQueryKeys.forEach((key) => {
    const value = incomingUrl.searchParams.get(key)
    if (value) {
      targetParams.set(key, value)
    }
  })

  return forwardToBackend(`/subject-requests?${targetParams}`)
}

export async function POST(request: Request) {

  const bodyText = await request.text()

  return forwardToBackend(`/subject-requests`, { method: 'POST', body: bodyText })
}
