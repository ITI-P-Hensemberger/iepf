import { createRoute, z } from '@hono/zod-openapi'

import { insertUsersSchema, patchUsersSchema, selectUsersSchema } from '@/db/schemas/users.schema'
import { notFoundSchema } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorSchema, createMessageObjectSchema, IdUUIDParamsSchema } from '@/lib/openapi/schemas'

const tags = ['Users']
const bearerAuth = [{
  bearerAuth: [] as string[]
}]

export const list = createRoute({
  path: '/users',
  method: 'get',
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(selectUsersSchema),
      'The list of users'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const create = createRoute({
  path: '/users',
  method: 'post',
  request: {
    body: jsonContentRequired(
      insertUsersSchema,
      'The user to create'
    )
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.CREATED]: {
      ...jsonContent(
        selectUsersSchema,
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
      createErrorSchema(insertUsersSchema),
      'The validation error(s)'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        email: z.string().min(1)
      })),
      'Given email already exists'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
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
      selectUsersSchema,
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
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
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
      selectUsersSchema,
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
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
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
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type ListRoute = typeof list
export type CreateRoute = typeof create
export type GetOneRoute = typeof getOne
export type PatchRoute = typeof patch
export type RemoveRoute = typeof remove
