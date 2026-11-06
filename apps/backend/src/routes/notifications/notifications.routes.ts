// Purpose: Push notification route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema } from '@/lib/openapi/schemas'

const tags = ['Notifications']
const security = [{ bearerAuth: [] as string[] }]

const unauthorized = jsonContent(createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED), 'Invalid credentials')
const forbidden = jsonContent(
  createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
  'Only students, tutors and admins, and never during impersonation'
)

export const pushConfigSchema = z.object({
  enabled: z.boolean(),
  publicKey: z.string().nullable()
})

export const subscribeSchema = z.object({
  endpoint: z.string().max(2048),
  keys: z.object({
    p256dh: z.string().max(200),
    auth: z.string().max(100)
  })
})

export const unsubscribeSchema = z.object({
  endpoint: z.string().max(2048)
})

// The admin* keys matter only to admins; email* ones are their email switches.
export const preferencesSchema = z.object({
  bookings: z.boolean(),
  reminders: z.boolean(),
  feedback: z.boolean(),
  account: z.boolean(),
  lessons: z.boolean(),
  adminLowFeedback: z.boolean(),
  adminLateCancellations: z.boolean(),
  adminAbsences: z.boolean(),
  adminEmptyWeek: z.boolean(),
  adminPendingAdmins: z.boolean(),
  adminSubjectRequests: z.boolean(),
  emailAdminLowFeedback: z.boolean(),
  emailAdminLateCancellations: z.boolean(),
  emailAdminAbsences: z.boolean(),
  emailAdminEmptyWeek: z.boolean(),
  emailAdminPendingAdmins: z.boolean(),
  emailAdminSubjectRequests: z.boolean()
})

export const updatePreferencesSchema = preferencesSchema.partial()

export const getPushConfig = createRoute({
  path: '/notifications/push/config',
  method: 'get',
  tags,
  security,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(pushConfigSchema, 'Whether push is configured, and the VAPID public key'),
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const subscribe = createRoute({
  path: '/notifications/push/subscriptions',
  method: 'post',
  tags,
  security,
  request: {
    body: jsonContentRequired(subscribeSchema, 'Subscription from PushManager.subscribe()')
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: { description: 'Subscription saved' },
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(subscribeSchema).or(createErrorMessageSchema('Sottoscrizione non valida')),
      'Validation error(s)'
    ),
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.SERVICE_UNAVAILABLE),
      'Push notifications are not configured'
    ),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const unsubscribe = createRoute({
  path: '/notifications/push/subscriptions',
  method: 'delete',
  tags,
  security,
  request: {
    body: jsonContentRequired(unsubscribeSchema, 'Endpoint of the device to remove')
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: { description: 'Subscription removed, or it did not exist' },
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(unsubscribeSchema), 'Validation error(s)'),
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const getPreferences = createRoute({
  path: '/notifications/preferences',
  method: 'get',
  tags,
  security,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(preferencesSchema, 'Notification kinds the user wants'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const updatePreferences = createRoute({
  path: '/notifications/preferences',
  method: 'put',
  tags,
  security,
  request: {
    body: jsonContentRequired(updatePreferencesSchema, 'Kinds to change')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(preferencesSchema, 'Preferences after the change'),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(updatePreferencesSchema), 'Validation error(s)'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export type GetPushConfigRoute = typeof getPushConfig
export type SubscribeRoute = typeof subscribe
export type UnsubscribeRoute = typeof unsubscribe
export type GetPreferencesRoute = typeof getPreferences
export type UpdatePreferencesRoute = typeof updatePreferences
