// Purpose: Auth route schemas.
import { createRoute, z } from '@hono/zod-openapi'

import { selectUsersWithProfilesSchema, studentRegisterSchema } from '@/db/schemas/users.schema'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorSchema, createMessageObjectSchema } from '@/lib/openapi/schemas'

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
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema('Email not verified'),
      'Email not verified'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Rate limit exceeded'
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
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Rate limit exceeded'
    )
  }
})

export const logout = createRoute({
  path: '/auth/logout',
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
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'Logged out'
    },
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Rate limit exceeded'
    )
  }
})

export const register = createRoute({
  path: '/auth/register',
  method: 'post',
  tags,
  request: {
    body: jsonContentRequired(
      studentRegisterSchema,
      'Student registration payload'
    )
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      selectUsersWithProfilesSchema,
      'Registered student'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        email: z.string().min(1)
      })),
      'Given email already exists'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(studentRegisterSchema),
      'The validation error(s)'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Rate limit exceeded'
    )
  }
})

export const requestPasswordReset = createRoute({
  path: '/auth/password/reset/request',
  method: 'post',
  tags,
  request: {
    body: jsonContentRequired(
      z.object({
        email: z.email()
      }),
      'Password reset request'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema('If the account exists, a reset email has been sent.'),
      'Password reset email queued'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Rate limit exceeded'
    )
  }
})

export const confirmPasswordReset = createRoute({
  path: '/auth/password/reset/confirm',
  method: 'post',
  tags,
  request: {
    body: jsonContentRequired(
      z.object({
        token: z.string().min(1),
        password: z.string().min(8)
      }),
      'Password reset confirmation'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema('Password reset successfully.'),
      'Password reset'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid or expired reset token'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Rate limit exceeded'
    )
  }
})

export const requestEmailVerification = createRoute({
  path: '/auth/verify-email/request',
  method: 'post',
  tags,
  request: {
    body: jsonContentRequired(
      z.object({
        email: z.email()
      }),
      'Email verification request'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema('If the account exists, a verification email has been sent.'),
      'Verification email queued'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Rate limit exceeded'
    )
  }
})

export const confirmEmailVerification = createRoute({
  path: '/auth/verify-email/confirm',
  method: 'post',
  tags,
  request: {
    body: jsonContentRequired(
      z.object({
        token: z.string().min(1)
      }),
      'Email verification confirmation'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema('Email verified.'),
      'Email verified'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid or expired verification token'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Rate limit exceeded'
    )
  }
})

export type LoginRoute = typeof login
export type RefreshRoute = typeof refresh
export type LogoutRoute = typeof logout
export type RegisterRoute = typeof register
export type RequestPasswordResetRoute = typeof requestPasswordReset
export type ConfirmPasswordResetRoute = typeof confirmPasswordReset
export type RequestEmailVerificationRoute = typeof requestEmailVerification
export type ConfirmEmailVerificationRoute = typeof confirmEmailVerification
