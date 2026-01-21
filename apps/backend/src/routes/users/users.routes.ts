// Purpose: Users route schemas.
import { createRoute, z } from '@hono/zod-openapi'

import { adminCreateUserSchema, patchUsersSchema, selectUsersWithProfilesSchema } from '@/db/schemas/users.schema'
import { notFoundSchema } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { queryBoolean } from '@/lib/zod-utils'
import { IdUUIDParamsSchema, createErrorSchema, createErrorMessageSchema, createPagedListSchema } from '@/lib/openapi/schemas'

const tags = ['Users']
const bearerAuth = [{
  bearerAuth: [] as string[]
}]

const listQuerySchema = z.object({
  q: z.string().min(1).optional(),
  role: z.enum(['student', 'tutor', 'admin', 'activator']).optional(),
  isActive: queryBoolean().optional(),
  emailVerified: queryBoolean().optional(),
  sectionId: z.uuid().optional(),
  year: z.coerce.number().int().optional(),
  sortBy: z.enum(['firstName', 'lastName', 'email', 'createdAt', 'sectionId', 'year']).default('lastName'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

export const list = createRoute({
  path: '/users',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: listQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(selectUsersWithProfilesSchema),
      'The list of users'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(listQuerySchema),
      'Invalid query parameters'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const create = createRoute({
  path: '/users',
  method: 'post',
  request: {
    body: jsonContentRequired(
      // Admin-only user creation supports assigning tutor roles.
      adminCreateUserSchema,
      'The user to create'
    )
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.CREATED]: {
      ...jsonContent(
        selectUsersWithProfilesSchema,
        'The created user'
      ),
      headers: {
        Location: {
          description: 'Relative URL of the created user resource',
          schema: {
            type: 'string',
            format: 'uri-reference'
          }
        }
      }
    },
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(adminCreateUserSchema),
      'The validation error(s)'
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
      'Invalid credentials'
    )
  }
})

export const getOne = createRoute({
  path: '/users/{id}',
  method: 'get',
  request: {
    params: IdUUIDParamsSchema
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      selectUsersWithProfilesSchema,
      'The requested user'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'User not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(IdUUIDParamsSchema),
      'Invalid id error'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const patch = createRoute({
  path: '/users/{id}',
  method: 'patch',
  request: {
    params: IdUUIDParamsSchema,
    body: jsonContentRequired(
      patchUsersSchema,
      'The user updates'
    )
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      selectUsersWithProfilesSchema,
      'The updated user'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'User not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(patchUsersSchema)
        .or(createErrorSchema(IdUUIDParamsSchema)),
      'The validation error(s)'
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

export const remove = createRoute({
  path: '/users/{id}',
  method: 'delete',
  request: {
    params: IdUUIDParamsSchema
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'User deleted'
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'User not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(IdUUIDParamsSchema),
      'Invalid id error'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type ListRoute = typeof list
export type CreateRoute = typeof create
export type GetOneRoute = typeof getOne
export type PatchRoute = typeof patch
export type RemoveRoute = typeof remove
