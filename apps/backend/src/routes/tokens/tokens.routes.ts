// Purpose: Token adjustment route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorSchema, createErrorMessageSchema } from '@/lib/openapi/schemas'

const tags = ['Tokens']
const bearerAuth = [{
  bearerAuth: [] as string[]
}]

const StudentIdParamsSchema = z.object({
  studentId: z.uuid().openapi({
    param: {
      name: 'studentId',
      in: 'path',
      required: true
    },
    required: ['studentId'],
    example: '4651e634-a530-4484-9b09-9616a28f35e3'
  })
})

export const adjustTokensSchema = z.object({
  delta: z.number().int(),
  reason: z.string().min(1).max(200)
})

export const tokenBalanceSchema = z.object({
  studentId: z.string(),
  lessonTokens: z.number().int()
})

export const adjustTokens = createRoute({
  path: '/students/{studentId}/tokens/adjust',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: StudentIdParamsSchema,
    body: jsonContentRequired(
      adjustTokensSchema,
      'Token adjustment payload'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      tokenBalanceSchema,
      'Token balance updated'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Student not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(adjustTokensSchema).or(createErrorSchema(StudentIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type AdjustTokensRoute = typeof adjustTokens
