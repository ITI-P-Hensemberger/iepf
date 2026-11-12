// Purpose: Admin impersonation route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema } from '@/lib/openapi/schemas'

const tags = ['AdminImpersonation']
const bearerAuth = [
  {
    bearerAuth: [] as string[]
  }
]

const impersonateRequestSchema = z.object({
  userId: z.uuid()
})

const impersonateResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.number().int().positive(),
  impersonatedUser: z.object({
    id: z.string(),
    email: z.string(),
    role: z.string()
  })
})

const endImpersonationResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.number().int().positive()
})

export const impersonate = createRoute({
  path: '/admin/impersonate',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    body: jsonContentRequired(impersonateRequestSchema, 'Impersonation request')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      impersonateResponseSchema,
      'Impersonation access token'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Target user not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(impersonateRequestSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const endImpersonation = createRoute({
  path: '/admin/impersonate/end',
  method: 'post',
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      endImpersonationResponseSchema,
      'Admin access token restored'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Impersonation token required'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type ImpersonateRoute = typeof impersonate
export type EndImpersonationRoute = typeof endImpersonation
