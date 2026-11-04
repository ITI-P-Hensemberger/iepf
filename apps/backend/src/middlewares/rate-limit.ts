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
  // Narrows the bucket beyond the client IP, e.g. to one account behind a shared school NAT.
  discriminator?: (c: Context<AppBindings>) => Promise<string | null>
}

const PRUNE_THRESHOLD = 10_000

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
    const discriminator = options.discriminator ? await options.discriminator(c) : null
    const key = [options.keyPrefix, getClientKey(c), discriminator].filter(Boolean).join(':')
    if (store.size >= PRUNE_THRESHOLD) {
      store.forEach((value, storedKey) => {
        if (value.resetAt <= now) {
          store.delete(storedKey)
        }
      })
    }
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

export async function loginEmailDiscriminator(c: Context<AppBindings>) {
  try {
    const body = await c.req.json()
    return typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : null
  }
  catch {
    return null
  }
}
