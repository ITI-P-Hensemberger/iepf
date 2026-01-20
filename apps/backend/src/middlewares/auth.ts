// Purpose: Bearer auth middleware.
import type { Context, MiddlewareHandler } from 'hono'

import type { AppBindings } from '@/lib/types'

import db from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { verifyAccessToken } from '@/lib/auth'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { buildErrorResponse } from '@/lib/error-response'

function unauthorized(c: Context<AppBindings>) {
  return c.json(buildErrorResponse(HttpStatusPhrases.UNAUTHORIZED), HttpStatusCodes.UNAUTHORIZED)
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
      let isActive: boolean | null | undefined

      if (payload.role === 'admin') {
        const profile = await db.query.adminProfiles.findFirst({
          where(fields, operators) {
            return operators.eq(fields.userId, payload.sub)
          },
          columns: { isActive: true }
        })
        isActive = profile?.isActive ?? false
      } else if (payload.role === 'tutor') {
        const profile = await db.query.tutorProfiles.findFirst({
          where(fields, operators) {
            return operators.eq(fields.userId, payload.sub)
          },
          columns: { isActive: true }
        })
        isActive = profile?.isActive ?? false
      }

      c.set('currentUser', {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        isActive
      })
    }
    catch {
      return unauthorized(c)
    }

    await next()
  }
}
