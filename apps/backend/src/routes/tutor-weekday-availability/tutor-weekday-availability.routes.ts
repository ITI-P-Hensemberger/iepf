// Purpose: Tutor weekday availability route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema } from '@/lib/openapi/schemas'

const tags = ['TutorWeekdayAvailability']
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

const weekdayStartTimeSchema = z.enum(['14:00', '15:00', '14:00-16:00'])

export const weekdayAvailabilityItemSchema = z.object({
  weekday: z.number().int().min(1).max(5),
  isAvailable: z.boolean(),
  startTime: weekdayStartTimeSchema.nullable()
}).superRefine((value, ctx) => {
  if (value.isAvailable && value.startTime === null) {
    ctx.addIssue({
      code: 'custom',
      message: 'startTime is required when isAvailable is true',
      path: ['startTime']
    })
  }

  if (!value.isAvailable && value.startTime !== null) {
    ctx.addIssue({
      code: 'custom',
      message: 'startTime must be null when isAvailable is false',
      path: ['startTime']
    })
  }
})

export const weekdayAvailabilitySchema = z.object({
  tutorId: z.string(),
  weekdays: z.array(weekdayAvailabilityItemSchema)
})

export const updateWeekdayAvailabilitySchema = z.object({
  weekdays: z.array(weekdayAvailabilityItemSchema).min(1).max(5)
})

export const getWeekdayAvailability = createRoute({
  path: '/tutors/{tutorId}/weekday-availability',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      weekdayAvailabilitySchema,
      'Tutor weekday availability'
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

export const updateWeekdayAvailability = createRoute({
  path: '/tutors/{tutorId}/weekday-availability',
  method: 'put',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema,
    body: jsonContentRequired(
      updateWeekdayAvailabilitySchema,
      'Weekday availability updates'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      weekdayAvailabilitySchema,
      'Tutor weekday availability updated'
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
      createErrorSchema(updateWeekdayAvailabilitySchema).or(createErrorSchema(TutorIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type GetWeekdayAvailabilityRoute = typeof getWeekdayAvailability
export type UpdateWeekdayAvailabilityRoute = typeof updateWeekdayAvailability
