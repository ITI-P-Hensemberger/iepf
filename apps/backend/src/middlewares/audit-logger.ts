// Purpose: Persist request audit logs to the database.
import type { Context, Next } from 'hono'

import db from '@/db'
import { auditLogs } from '@/db/schemas/audit-logs.schema'

function requestIp(c: Context) {
  return c.req.header('cf-connecting-ip')
    ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('x-real-ip')
    ?? null
}

export function auditLogger() {
  return async (c: Context, next: Next) => {
    const start = Date.now()
    await next()

    const durationMs = Date.now() - start
    const currentUser = c.get('currentUser')
    const requestId = c.get('requestId') ?? c.req.header('x-request-id')

    const action = `${c.req.method} ${c.req.path}`
    const metadata = {
      queryKeys: Object.keys(c.req.query())
    }

    try {
      await db.insert(auditLogs).values({
        actorId: currentUser?.id ?? null,
        actorRole: currentUser?.role ?? null,
        action,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ip: requestIp(c),
        userAgent: c.req.header('user-agent') ?? null,
        requestId: requestId ?? null,
        durationMs,
        metadata: JSON.stringify(metadata)
      })
    }
    catch {
      // Audit logging should never block the response lifecycle.
    }
  }
}
