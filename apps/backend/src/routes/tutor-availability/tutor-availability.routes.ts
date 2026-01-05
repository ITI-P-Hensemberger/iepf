// Purpose: Tutor availability route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorSchema, createMessageObjectSchema } from '@/lib/openapi/schemas'

const tags = ['TutorAvailability']
const bearerAuth = [{
  bearerAuth: [] as string[]
}]

const TutorIdParamsSchema = z.object({
  tutorId: z.uuid().openapi({
    param: {
      name: 'tutorId',
      in: 'path',
      required: true
    },
    required: ['tutorId'],
    example: '4651e634-a530-4484-9b09-9616a28f35e3'
  })
})

const AvailabilityIdParamsSchema = z.object({
  availabilityId: z.uuid().openapi({
    param: {
      name: 'availabilityId',
      in: 'path',
      required: true
    },
    required: ['availabilityId'],
    example: '559c7d0f-0b91-4a4f-8a1b-2ef0f7b66f1e'
  })
})

export const availabilitySchema = z.object({
  id: z.string(),
  tutorId: z.string(),
  weekday: z.number().int(),
  startTime: z.string(),
  endTime: z.string()
})

export const createAvailabilitySchema = z.object({
  weekday: z.number().int().min(1).max(5),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/)
})

export const listAvailability = createRoute({
  path: '/tutors/{tutorId}/availability',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(availabilitySchema),
      'Tutor availability'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Tutor not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or self access required'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const createAvailability = createRoute({
  path: '/tutors/{tutorId}/availability',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema,
    body: jsonContentRequired(
      createAvailabilitySchema,
      'Availability window'
    )
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      availabilitySchema,
      'Availability created'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Tutor not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or self access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(createAvailabilitySchema).or(createErrorSchema(TutorIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const deleteAvailability = createRoute({
  path: '/tutors/{tutorId}/availability/{availabilityId}',
  method: 'delete',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema.extend(AvailabilityIdParamsSchema.shape)
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'Availability removed'
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Availability not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or self access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(TutorIdParamsSchema.extend(AvailabilityIdParamsSchema.shape)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type ListAvailabilityRoute = typeof listAvailability
export type CreateAvailabilityRoute = typeof createAvailability
export type DeleteAvailabilityRoute = typeof deleteAvailability
