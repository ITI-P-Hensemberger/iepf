// Purpose: Global error handler.
import type { ErrorHandler } from 'hono'
import type { ContentfulStatusCode, ContentlessStatusCode } from 'hono/utils/http-status'

import { buildErrorResponse } from '@/lib/error-response'
import { INTERNAL_SERVER_ERROR, OK } from '@/lib/http-status-codes'
import { INTERNAL_SERVER_ERROR as INTERNAL_SERVER_ERROR_MESSAGE } from '@/lib/http-status-phrases'

const CONTENTLESS_CODES: ContentlessStatusCode[] = [101, 204, 205, 304]

const onError: ErrorHandler = (err, c) => {
  const candidate = typeof (err as { status?: number }).status === 'number'
    ? (err as { status?: number }).status as number
    : c.newResponse(null).status
  const nextStatus = candidate !== OK ? candidate : INTERNAL_SERVER_ERROR
  const statusCode = (CONTENTLESS_CODES.includes(nextStatus as ContentlessStatusCode)
    ? INTERNAL_SERVER_ERROR
    : nextStatus) as ContentfulStatusCode

  const message = statusCode >= INTERNAL_SERVER_ERROR
    ? INTERNAL_SERVER_ERROR_MESSAGE
    : err.message

  return c.json(
    buildErrorResponse(message),
    statusCode
  )
}

export default onError
