// Purpose: Class sections route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import {
  insertClassSectionsSchema,
  patchClassSectionsSchema,
  selectClassSectionsSchema
} from '@/db/schemas/class-sections.schema'
import { notFoundSchema } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { IdUUIDParamsSchema, createErrorSchema, createErrorMessageSchema, createPagedListSchema } from '@/lib/openapi/schemas'

const tags = ['ClassSections']
const bearerAuth = [{
  bearerAuth: [] as string[]
}]

const listQuerySchema = z.object({
  q: z.string().min(1).optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

export const list = createRoute({
  path: '/class-sections',
  method: 'get',
  tags,
  request: {
    query: listQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(selectClassSectionsSchema),
      'The list of class sections'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(listQuerySchema),
      'Invalid query parameters'
    )
  }
})

export const create = createRoute({
  path: '/class-sections',
  method: 'post',
  request: {
    body: jsonContentRequired(
      insertClassSectionsSchema,
      'The class section to create'
    )
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.CREATED]: {
      ...jsonContent(
        selectClassSectionsSchema,
        'The created class section'
      ),
      headers: {
        Location: {
          description: 'Relative URL of the created class section resource',
          schema: {
            type: 'string',
            format: 'uri-reference'
          }
        }
      }
    },
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(insertClassSectionsSchema),
      'The validation error(s)'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        name: z.string().min(1)
      })),
      'Given name already exists'
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
  path: '/class-sections/{id}',
  method: 'get',
  request: {
    params: IdUUIDParamsSchema
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      selectClassSectionsSchema,
      'The requested class section'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'Class section not found'
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

export const patch = createRoute({
  path: '/class-sections/{id}',
  method: 'patch',
  request: {
    params: IdUUIDParamsSchema,
    body: jsonContentRequired(
      patchClassSectionsSchema,
      'The class section updates'
    )
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      selectClassSectionsSchema,
      'The updated class section'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'Class section not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(patchClassSectionsSchema)
        .or(createErrorSchema(IdUUIDParamsSchema)),
      'The validation error(s)'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({
        name: z.string().min(1)
      })),
      'Given name already exists'
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
  path: '/class-sections/{id}',
  method: 'delete',
  request: {
    params: IdUUIDParamsSchema
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'Class section deleted'
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'Class section not found'
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
