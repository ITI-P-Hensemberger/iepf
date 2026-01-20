// Purpose: Audit log route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent } from '@/lib/openapi/helpers'
import { createErrorSchema, createErrorMessageSchema, createPagedListSchema } from '@/lib/openapi/schemas'

const tags = ['Audit']
const bearerAuth = [{
  bearerAuth: [] as string[]
}]

const AuditIdParamsSchema = z.object({
  id: z.uuid().openapi({
    param: {
      name: 'id',
      in: 'path',
      required: true
    },
    required: ['id'],
    example: '9ed2a23d-8466-49a5-9557-ea6a5b20b8f1'
  })
})

const auditLogSchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  actorRole: z.string().nullable(),
  action: z.string(),
  method: z.string(),
  path: z.string(),
  status: z.number().int(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestId: z.string().nullable(),
  durationMs: z.number().int(),
  metadata: z.string().nullable(),
  createdAt: z.string()
})

const listQuerySchema = z.object({
  q: z.string().min(1).optional(),
  actorId: z.uuid().optional(),
  actorRole: z.string().optional(),
  action: z.string().optional(),
  method: z.string().optional(),
  path: z.string().optional(),
  status: z.coerce.number().int().optional(),
  requestId: z.string().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sortBy: z.enum(['createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

export const listAuditLogs = createRoute({
  path: '/audit/logs',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: listQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(auditLogSchema),
      'Audit log entries'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(listQuerySchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const getAuditLog = createRoute({
  path: '/audit/logs/{id}',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: AuditIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      auditLogSchema,
      'Audit log entry'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Audit log entry not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(AuditIdParamsSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type ListAuditLogsRoute = typeof listAuditLogs
export type GetAuditLogRoute = typeof getAuditLog
