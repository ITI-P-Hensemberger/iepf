// Purpose: Auth route schemas.
import { createRoute, z } from '@hono/zod-openapi'

import { schoolEmailSchema, selectUsersWithProfilesSchema, studentRegisterSchema } from '@/db/schemas/users.schema'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema, createMessageObjectSchema, createPagedListSchema, IdUUIDParamsSchema } from '@/lib/openapi/schemas'
import { queryBoolean } from '@/lib/zod-utils'

const tags = ['Auth']

export const tutorInviteRequestSchema = z.object({
  email: schoolEmailSchema
})

export const adminInviteRequestSchema = z.object({
  email: schoolEmailSchema
})

export const tutorInviteListItemSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  expiresAt: z.string(),
  createdAt: z.string()
})

export const adminInviteListItemSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  expiresAt: z.string(),
  createdAt: z.string()
})

export const tutorInviteListSchema = createPagedListSchema(tutorInviteListItemSchema)
export const adminInviteListSchema = createPagedListSchema(adminInviteListItemSchema)

export const inviteListQuerySchema = z.object({
  q: z.string().min(1).optional(),
  includeExpired: queryBoolean().optional(),
  sortBy: z.enum(['expiresAt', 'createdAt']).default('expiresAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

export const tutorInviteConfirmSchema = z.object({
  token: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
  sectionId: z.uuid(),
  year: z.number().int()
}).superRefine((value, ctx) => {
  if (value.year !== undefined && (value.year < 4 || value.year > 5)) {
    ctx.addIssue({
      code: 'custom',
      path: ['year'],
      message: 'L\'anno deve essere compreso tra 4 e 5'
    })
  }
})

export const adminInviteConfirmSchema = z.object({
  token: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z.string().min(8).max(200)
})

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
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema('Email non verificata'),
      'Email non verificata'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
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
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid refresh token'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
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
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
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
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.BAD_REQUEST),
      'Section not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(studentRegisterSchema),
      'The validation error(s)'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
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
      createMessageObjectSchema('Se l\'account esiste, e stata inviata un\'email di reimpostazione.'),
      'Email di reimpostazione in coda'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
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
      createMessageObjectSchema('Password reimpostata con successo.'),
      'Password reset'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid or expired reset token'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
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
      createMessageObjectSchema('Se l\'account esiste, e stata inviata un\'email di verifica.'),
      'Verification email queued'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
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
      createMessageObjectSchema('Email verificata.'),
      'Email verificata'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid or expired verification token'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Rate limit exceeded'
    )
  }
})

export const listAdminInvites = createRoute({
  path: '/auth/admin-invite',
  method: 'get',
  tags,
  security: [{ bearerAuth: [] as string[] }],
  request: {
    query: inviteListQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      adminInviteListSchema,
      'Pending admin invites'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(inviteListQuerySchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const deleteAdminInvite = createRoute({
  path: '/auth/admin-invite/{id}',
  method: 'delete',
  tags,
  security: [{ bearerAuth: [] as string[] }],
  request: {
    params: IdUUIDParamsSchema
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'Admin invite deleted'
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Invite not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(IdUUIDParamsSchema),
      'Invalid id error'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const inviteAdmin = createRoute({
  path: '/auth/admin-invite',
  method: 'post',
  tags,
  security: [{ bearerAuth: [] as string[] }],
  request: {
    body: jsonContentRequired(
      adminInviteRequestSchema,
      'Admin invite request'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema('Invito inviato.'),
      'Admin invite sent'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        email: z.string().min(1)
      })),
      'Given email already exists'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const confirmAdminInvite = createRoute({
  path: '/auth/admin-invite/confirm',
  method: 'post',
  tags,
  request: {
    body: jsonContentRequired(
      adminInviteConfirmSchema,
      'Admin invite confirmation payload'
    )
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      selectUsersWithProfilesSchema,
      'Registered admin'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        email: z.string().min(1)
      })),
      'Given email already exists'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid or expired invite token'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(adminInviteConfirmSchema),
      'The validation error(s)'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Rate limit exceeded'
    )
  }
})

export const listTutorInvites = createRoute({
  path: '/auth/tutor-invite',
  method: 'get',
  tags,
  security: [{ bearerAuth: [] as string[] }],
  request: {
    query: inviteListQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      tutorInviteListSchema,
      'Pending tutor invites'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(inviteListQuerySchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const deleteTutorInvite = createRoute({
  path: '/auth/tutor-invite/{id}',
  method: 'delete',
  tags,
  security: [{ bearerAuth: [] as string[] }],
  request: {
    params: IdUUIDParamsSchema
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'Tutor invite deleted'
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Invite not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(IdUUIDParamsSchema),
      'Invalid id error'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const inviteTutor = createRoute({
  path: '/auth/tutor-invite',
  method: 'post',
  tags,
  security: [{ bearerAuth: [] as string[] }],
  request: {
    body: jsonContentRequired(
      tutorInviteRequestSchema,
      'Tutor invite request'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema('Invito inviato.'),
      'Tutor invite sent'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        email: z.string().min(1)
      })),
      'Given email already exists'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const confirmTutorInvite = createRoute({
  path: '/auth/tutor-invite/confirm',
  method: 'post',
  tags,
  request: {
    body: jsonContentRequired(
      tutorInviteConfirmSchema,
      'Tutor invite confirmation payload'
    )
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      selectUsersWithProfilesSchema,
      'Registered tutor'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        email: z.string().min(1)
      })),
      'Given email already exists'
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.BAD_REQUEST),
      'Section not found'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid or expired invite token'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(tutorInviteConfirmSchema),
      'The validation error(s)'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
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
export type InviteTutorRoute = typeof inviteTutor
export type ConfirmTutorInviteRoute = typeof confirmTutorInvite
export type ListTutorInvitesRoute = typeof listTutorInvites
export type DeleteTutorInviteRoute = typeof deleteTutorInvite
export type InviteAdminRoute = typeof inviteAdmin
export type ConfirmAdminInviteRoute = typeof confirmAdminInvite
export type ListAdminInvitesRoute = typeof listAdminInvites
export type DeleteAdminInviteRoute = typeof deleteAdminInvite
