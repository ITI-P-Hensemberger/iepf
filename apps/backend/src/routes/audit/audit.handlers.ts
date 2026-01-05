// Purpose: Audit log route handlers.
import type { Context } from 'hono'

import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { auditLogs } from '@/db/schemas/audit-logs.schema'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type { GetAuditLogRoute, ListAuditLogsRoute } from './audit.routes'

type HandlerContext = Context<AppBindings>

function forbid(): never {
  throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
    message: HttpStatusPhrases.FORBIDDEN
  })
}

function ensureAdmin(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin') {
    forbid()
  }

  return currentUser
}

export const listAuditLogs: AppRouteHandler<ListAuditLogsRoute> = async (c) => {
  ensureAdmin(c)
  const query = c.req.valid('query')

  const conditions = []
  if (query.actorId) {
    conditions.push(eq(auditLogs.actorId, query.actorId))
  }
  if (query.actorRole) {
    conditions.push(eq(auditLogs.actorRole, query.actorRole))
  }
  if (query.action) {
    conditions.push(eq(auditLogs.action, query.action))
  }
  if (query.method) {
    conditions.push(eq(auditLogs.method, query.method))
  }
  if (query.path) {
    conditions.push(eq(auditLogs.path, query.path))
  }
  if (query.status !== undefined) {
    conditions.push(eq(auditLogs.status, query.status))
  }
  if (query.requestId) {
    conditions.push(eq(auditLogs.requestId, query.requestId))
  }
  if (query.from) {
    conditions.push(gte(auditLogs.createdAt, new Date(query.from)))
  }
  if (query.to) {
    conditions.push(lte(auditLogs.createdAt, new Date(query.to)))
  }

  const whereClause = conditions.length > 0
    ? and(...conditions)
    : undefined

  const rows = await db.query.auditLogs.findMany({
    where: whereClause,
    orderBy(fields) {
      return desc(fields.createdAt)
    },
    limit: query.limit,
    offset: query.offset
  })

  return c.json(rows.map(row => ({
    ...row,
    createdAt: new Date(row.createdAt ?? 0).toISOString()
  })), HttpStatusCodes.OK)
}

export const getAuditLog: AppRouteHandler<GetAuditLogRoute> = async (c) => {
  ensureAdmin(c)
  const { id } = c.req.valid('param')

  const entry = await db.query.auditLogs.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, id)
    }
  })

  if (!entry) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  return c.json(
    {
      ...entry,
      createdAt: new Date(entry.createdAt ?? 0).toISOString()
    },
    HttpStatusCodes.OK
  )
}
