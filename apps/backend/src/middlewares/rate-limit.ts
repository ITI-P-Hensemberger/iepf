// Purpose: In-memory rate limiter.
import type { Context, MiddlewareHandler } from 'hono'

import type { AppBindings } from '@/lib/types'

import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

interface RateLimitOptions {
  windowMs: number
  max: number
  keyPrefix: string
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Set<Map<string, RateLimitEntry>>()

function getClientKey(c: Context<AppBindings>) {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }
  return c.req.header('x-real-ip') || 'unknown'
}

export function resetRateLimiters() {
  stores.forEach(store => store.clear())
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppBindings> {
  const store = new Map<string, RateLimitEntry>()
  stores.add(store)

  return async (c, next) => {
    const currentUser = c.get('currentUser')

    // Skip rate limiting for admins
    if (currentUser && currentUser.role === 'admin') {
      await next()
      return
    }

    const now = Date.now()
    const key = `${options.keyPrefix}:${getClientKey(c)}`
    const existing = store.get(key)
    const entry = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + options.windowMs }

    entry.count += 1
    store.set(key, entry)

    const remaining = Math.max(options.max - entry.count, 0)
    c.header('X-RateLimit-Limit', String(options.max))
    c.header('X-RateLimit-Remaining', String(remaining))
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    if (entry.count > options.max) {
      return c.json(buildErrorResponse(HttpStatusPhrases.TOO_MANY_REQUESTS), HttpStatusCodes.TOO_MANY_REQUESTS)
    }

    await next()
  }
}
