import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createMessageObjectSchema } from '@/lib/openapi/schemas'

const tags = ['Auth']

export const loginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1)
}).required()

export const tokenResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string(),
  refreshTokenExpiresIn: z.number().int().positive()
})

export const login = createRoute({
  path: '/auth/login',
  method: 'post',
  tags,
  request: {
    body: jsonContentRequired(loginBodySchema, 'User credentials')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      tokenResponseSchema,
      'Authenticated'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const refresh = createRoute({
  path: '/auth/refresh',
  method: 'post',
  tags,
  request: {
    body: jsonContentRequired(
      z.object({
        refreshToken: z.string().min(1)
      }),
      'Refresh token payload'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      tokenResponseSchema,
      'Rotated tokens'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid refresh token'
    )
  }
})

export type LoginRoute = typeof login
export type RefreshRoute = typeof refresh
