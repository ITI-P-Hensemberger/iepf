import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { createErrorSchema, IdUUIDParamsSchema } from 'stoker/openapi/schemas'

import { insertUsersSchema, patchUsersSchema, selectUsersSchema } from '@/db/schemas/users.schema'
import { notFoundSchema } from '@/lib/constants'

const tags = ['Users']

export const list = createRoute({
  path: '/users',
  method: 'get',
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(selectUsersSchema),
      'The list of users'
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
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      selectUsersSchema,
      'The created user'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(insertUsersSchema),
      'The validation error(s)'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        email: z.string().min(1)
      })),
      'Given email already exists'
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
    )
  }
})

export type ListRoute = typeof list
export type CreateRoute = typeof create
export type GetOneRoute = typeof getOne
export type PatchRoute = typeof patch
export type RemoveRoute = typeof remove
