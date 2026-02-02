// Purpose: Bearer auth middleware.
import type { Context, MiddlewareHandler } from 'hono'

import type { AppBindings } from '@/lib/types'

import db from '@/db'
import { verifyAccessToken } from '@/lib/auth'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { maintenanceSchema } from '@/routes/settings/settings.routes'

const defaultMaintenance = maintenanceSchema.parse({
  enabled: false,
  message: null,
  roles: ['student', 'tutor']
})

function unauthorized(c: Context<AppBindings>) {
  return c.json(buildErrorResponse(HttpStatusPhrases.UNAUTHORIZED), HttpStatusCodes.UNAUTHORIZED)
}

function forbidden(c: Context<AppBindings>) {
  return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
}

async function readMaintenanceSetting() {
  const row = await db.query.globalSettings.findFirst({
    where(fields, operators) {
      return operators.eq(fields.key, 'maintenance')
    },
    columns: { value: true }
  })
  if (!row) {
    return defaultMaintenance
  }
  const parsed = maintenanceSchema.safeParse(row.value)
  return parsed.success ? parsed.data : defaultMaintenance
}

function isAllowedMaintenanceRequest(c: Context<AppBindings>, userId: string) {
  const method = c.req.method.toUpperCase()
  if (method === 'POST' && (c.req.path === '/auth/login' || c.req.path === '/auth/logout' || c.req.path === '/auth/refresh' || c.req.path === '/auth/password/reset/request')) {
    return true
  }
  if (method === 'POST' && c.req.path === '/admin/impersonate/end') {
    return true
  }
  if (c.req.method.toUpperCase() === 'GET' && (c.req.path === '/settings' || c.req.path === '/settings/me')) {
    return true
  }
  const match = c.req.path.match(/^\/users\/([^/]+)$/)
  if (!match || match[1] !== userId) {
    return false
  }
  return method === 'GET' || method === 'PATCH'
}

export function authenticate(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? c.req.header('Authorization')

    if (!header) {
      return unauthorized(c)
    }

    const [scheme, token] = header.trim().split(/\s+/)

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
      }
      else if (payload.role === 'tutor') {
        const profile = await db.query.tutorProfiles.findFirst({
          where(fields, operators) {
            return operators.eq(fields.userId, payload.sub)
          },
          columns: { isActive: true }
        })
        isActive = profile?.isActive ?? false
      }

      if (payload.impersonatedById && payload.impersonatedByEmail && payload.impersonatedByRole) {
        c.set('impersonation', {
          adminId: payload.impersonatedById,
          adminEmail: payload.impersonatedByEmail,
          adminRole: payload.impersonatedByRole,
          userId: payload.sub,
          userEmail: payload.email,
          userRole: payload.role
        })
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

    const currentUser = c.get('currentUser')
    if (currentUser?.role === 'student' || currentUser?.role === 'tutor') {
      const maintenance = await readMaintenanceSetting()
      if (maintenance.enabled && maintenance.roles.includes(currentUser.role)) {
        if (!isAllowedMaintenanceRequest(c, currentUser.id)) {
          return forbidden(c)
        }
      }
    }

    await next()
  }
}
