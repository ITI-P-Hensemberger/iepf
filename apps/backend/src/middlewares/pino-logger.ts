// Purpose: Request logging middleware.
import type { DestinationStream } from 'pino'

import { pinoLogger as logger } from 'hono-pino'
import pino from 'pino'
import pretty from 'pino-pretty'

import env from '@/env'

// Bearer tokens and session cookies let whoever reads the logs act as the user until they
// expire, and the JWT also carries the email: none of them is ever written.
export const REDACTED_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]'
]

export function createPino(destination?: DestinationStream, level = env.LOG_LEVEL || 'info') {
  return pino({
    level,
    redact: { paths: REDACTED_LOG_PATHS, censor: '[redacted]' }
  }, destination ?? (env.NODE_ENV === 'production'
    ? undefined
    : pretty()))
}

// Tests pass their own destination and level: the test environment logs nothing by default.
export function pinoLogger(destination?: DestinationStream, level?: pino.LevelWithSilent) {
  return logger({
    pino: createPino(destination, level)
  })
}
