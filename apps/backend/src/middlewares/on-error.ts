import type { ErrorHandler } from 'hono'
import type { ContentfulStatusCode, ContentlessStatusCode } from 'hono/utils/http-status'

import { INTERNAL_SERVER_ERROR, OK } from '@/lib/http-status-codes'

const CONTENTLESS_CODES: ContentlessStatusCode[] = [101, 204, 205, 304]

const onError: ErrorHandler = (err, c) => {
  const candidate = typeof (err as { status?: number }).status === 'number'
    ? (err as { status?: number }).status as number
    : c.newResponse(null).status
  const nextStatus = candidate !== OK ? candidate : INTERNAL_SERVER_ERROR
  const statusCode = (CONTENTLESS_CODES.includes(nextStatus as ContentlessStatusCode)
    ? INTERNAL_SERVER_ERROR
    : nextStatus) as ContentfulStatusCode

  // eslint-disable-next-line node/no-process-env
  const env = c.env?.NODE_ENV || process.env?.NODE_ENV

  return c.json(
    {
      message: err.message,
      stack: env === 'production' ? undefined : err.stack
    },
    statusCode
  )
}

export default onError
