import type { Context, MiddlewareHandler } from 'hono'

import type { AppBindings } from '@/lib/types'

import { verifyAccessToken } from '@/lib/auth'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

function unauthorized(c: Context<AppBindings>) {
  return c.json(
    { message: HttpStatusPhrases.UNAUTHORIZED },
    HttpStatusCodes.UNAUTHORIZED
  )
}

export function authenticate(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const header = c.req.header('Authorization')

    if (!header) {
      return unauthorized(c)
    }

    const [scheme, token] = header.split(' ')

    if (!token || !scheme || scheme.toLowerCase() !== 'bearer') {
      return unauthorized(c)
    }

    try {
      const payload = await verifyAccessToken(token)
      c.set('currentUser', {
        id: payload.sub,
        email: payload.email,
        role: payload.role
      })
    }
    catch {
      return unauthorized(c)
    }

    await next()
  }
}
