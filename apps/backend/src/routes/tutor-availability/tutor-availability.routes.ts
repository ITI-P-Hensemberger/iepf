// Purpose: Tutor availability route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorSchema, createErrorMessageSchema, createPagedListSchema } from '@/lib/openapi/schemas'

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

const availabilityListQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sortBy: z.enum(['startAt']).default('startAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
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
  startAt: z.string(),
  durationMinutes: z.number().int(),
  seats: z.number().int()
})

export const createAvailabilitySchema = z.object({
  date: z.iso.date()
})

export const listAvailability = createRoute({
  path: '/tutors/{tutorId}/availability',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema,
    query: availabilityListQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(availabilitySchema),
      'Tutor availability'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(availabilityListQuerySchema),
      'Invalid query parameters'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Tutor not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or self access required'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const listAvailableSlots = createRoute({
  path: '/tutors/{tutorId}/availability/slots',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema,
    query: availabilityListQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(availabilitySchema),
      'Available slots'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(availabilityListQuerySchema),
      'Invalid query parameters'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Tutor not found'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
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
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.BAD_REQUEST),
      'Availability must be within next week'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.CONFLICT),
      'Availability slot already exists'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Tutor not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or self access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(createAvailabilitySchema).or(createErrorSchema(TutorIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
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
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Availability not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or self access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(TutorIdParamsSchema.extend(AvailabilityIdParamsSchema.shape)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type ListAvailabilityRoute = typeof listAvailability
export type ListAvailableSlotsRoute = typeof listAvailableSlots
export type CreateAvailabilityRoute = typeof createAvailability
export type DeleteAvailabilityRoute = typeof deleteAvailability
