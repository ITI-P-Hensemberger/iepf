// Purpose: Tutor settings route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema } from '@/lib/openapi/schemas'

const tags = ['TutorSettings']
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

export const tutorSettingsSchema = z.object({
  tutorId: z.string(),
  dailyCapacity: z.number().int().positive()
})

export const updateTutorSettingsSchema = z.object({
  dailyCapacity: z.number().int().positive()
})

export const getSettings = createRoute({
  path: '/tutors/{tutorId}/settings',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      tutorSettingsSchema,
      'Tutor settings'
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

export const updateSettings = createRoute({
  path: '/tutors/{tutorId}/settings',
  method: 'put',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema,
    body: jsonContentRequired(
      updateTutorSettingsSchema,
      'Tutor settings'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      tutorSettingsSchema,
      'Tutor settings updated'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Tutor not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(updateTutorSettingsSchema).or(createErrorSchema(TutorIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type GetSettingsRoute = typeof getSettings
export type UpdateSettingsRoute = typeof updateSettings
