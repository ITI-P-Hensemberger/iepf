// Purpose: Subjects route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import { insertSubjectsSchema, patchSubjectsSchema, selectSubjectsSchema } from '@/db/schemas/subjects.schema'
import { notFoundSchema } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema, createPagedListSchema, IdUUIDParamsSchema } from '@/lib/openapi/schemas'

const tags = ['Subjects']
const bearerAuth = [{
  bearerAuth: [] as string[]
}]

const listQuerySchema = z.object({
  q: z.string().min(1).optional(),
  sortBy: z.enum(['name', 'canonicalName', 'createdAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

export const list = createRoute({
  path: '/subjects',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: listQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(selectSubjectsSchema),
      'The list of subjects'
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
  path: '/subjects',
  method: 'post',
  request: {
    body: jsonContentRequired(
      insertSubjectsSchema,
      'The subject to create'
    )
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.CREATED]: {
      ...jsonContent(
        selectSubjectsSchema,
        'The created subject'
      ),
      headers: {
        Location: {
          description: 'Relative URL of the created subject resource',
          schema: {
            type: 'string',
            format: 'uri-reference'
          }
        }
      }
    },
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(insertSubjectsSchema),
      'The validation error(s)'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        canonicalName: z.string().min(1)
      })),
      'Given canonical name already exists'
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

export const getOne = createRoute({
  path: '/subjects/{id}',
  method: 'get',
  request: {
    params: IdUUIDParamsSchema
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      selectSubjectsSchema,
      'The requested subject'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'Subject not found'
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
  path: '/subjects/{id}',
  method: 'patch',
  request: {
    params: IdUUIDParamsSchema,
    body: jsonContentRequired(
      patchSubjectsSchema,
      'The subject updates'
    )
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      selectSubjectsSchema,
      'The updated subject'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'Subject not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(patchSubjectsSchema)
        .or(createErrorSchema(IdUUIDParamsSchema)),
      'The validation error(s)'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        canonicalName: z.string().min(1)
      })),
      'Given canonical name already exists'
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
  path: '/subjects/{id}',
  method: 'delete',
  request: {
    params: IdUUIDParamsSchema
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'Subject deleted'
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'Subject not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
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
