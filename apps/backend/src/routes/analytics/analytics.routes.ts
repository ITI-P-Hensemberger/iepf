// Purpose: Collection endpoint for internal usage analytics.
import { createRoute, z } from '@hono/zod-openapi'

import { CLIENT_EVENTS } from '@/lib/analytics'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema } from '@/lib/openapi/schemas'

const tags = ['Analytics']
const security = [{ bearerAuth: [] as string[] }]

export const MAX_EVENTS_PER_BATCH = 50
export const MAX_COUNT_PER_EVENT = 50

export const analyticsBatchSchema = z.object({
  events: z.array(z.object({
    event: z.enum(CLIENT_EVENTS),
    detail: z.string().max(120).default(''),
    count: z.number().int().min(1).max(MAX_COUNT_PER_EVENT).default(1)
  })).min(1).max(MAX_EVENTS_PER_BATCH)
})

export const collectEvents = createRoute({
  path: '/analytics/events',
  method: 'post',
  tags,
  security,
  request: {
    body: jsonContentRequired(analyticsBatchSchema, 'Counts gathered by the browser since the last send')
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: { description: 'Counts added (or dropped, while impersonating)' },
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'No valid session'
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.TOO_MANY_REQUESTS),
      'Too many batches'
    )
  }
})

export type CollectEventsRoute = typeof collectEvents
