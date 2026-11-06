// Purpose: Global settings route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema } from '@/lib/openapi/schemas'

const tags = ['Settings']
const bearerAuth = [{
  bearerAuth: [] as string[]
}]

const roleSchema = z.enum(['student', 'tutor', 'admin', 'activator'])
const closureDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const maintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(500).nullable(),
  roles: z.array(roleSchema).default(['student', 'tutor'])
}).superRefine((value, ctx) => {
  if (value.roles.includes('admin') || value.roles.includes('activator')) {
    ctx.addIssue({
      code: 'custom',
      path: ['roles'],
      message: 'Maintenance roles cannot include admin or activator'
    })
  }
})

export const serviceMessageSchema = z.object({
  enabled: z.boolean(),
  level: z.enum(['info', 'warning', 'error', 'success']),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000)
})

export const serviceMessagesSchema = z.object({
  student: serviceMessageSchema.nullable().optional(),
  tutor: serviceMessageSchema.nullable().optional(),
  admin: serviceMessageSchema.nullable().optional(),
  activator: serviceMessageSchema.nullable().optional()
})

export const closureDatesSchema = z.array(closureDateSchema)

export const adminSettingsSchema = z.object({
  maintenance: maintenanceSchema,
  serviceMessages: serviceMessagesSchema,
  closureDates: closureDatesSchema
})

export const updateAdminSettingsSchema = z.object({
  maintenance: maintenanceSchema.optional(),
  serviceMessages: serviceMessagesSchema.optional(),
  closureDates: closureDatesSchema.optional()
}).superRefine((value, ctx) => {
  if (!value.maintenance && !value.serviceMessages && !value.closureDates) {
    ctx.addIssue({
      code: 'custom',
      path: [],
      message: 'At least one setting must be provided'
    })
  }
})

export const mySettingsSchema = z.object({
  maintenance: z.object({
    enabled: z.boolean(),
    message: z.string().nullable()
  }),
  serviceMessage: serviceMessageSchema.nullable()
})

export const resetSchoolYearSchema = z.object({
  confirmation: z.literal('RESET'),
  password: z.string().min(1).max(200)
})

export const resetSchoolYearResultSchema = z.object({
  deletedStudents: z.number().int().min(0),
  deletedTutors: z.number().int().min(0)
})

export const getAdminSettings = createRoute({
  path: '/settings',
  method: 'get',
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      adminSettingsSchema,
      'Global settings'
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

export const updateAdminSettings = createRoute({
  path: '/settings',
  method: 'patch',
  tags,
  security: bearerAuth,
  request: {
    body: jsonContentRequired(updateAdminSettingsSchema, 'Global settings payload')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      adminSettingsSchema,
      'Global settings updated'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(updateAdminSettingsSchema),
      'Validation error(s)'
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

export const getMySettings = createRoute({
  path: '/settings/me',
  method: 'get',
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      mySettingsSchema,
      'Role-specific settings'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const resetSchoolYear = createRoute({
  path: '/settings/school-year/reset',
  method: 'post',
  tags,
  security: bearerAuth,
  request: { body: jsonContentRequired(resetSchoolYearSchema, 'Reset confirmation') },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(resetSchoolYearResultSchema, 'School year reset'),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN), 'Wrong password or impersonated session'),
    [HttpStatusCodes.CONFLICT]: jsonContent(createErrorMessageSchema(HttpStatusPhrases.CONFLICT), 'The year report was not downloaded by this admin in the last 15 minutes'),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(resetSchoolYearSchema), 'Invalid confirmation')
  }
})

// Public: the site checks it before showing any page, also to visitors who are not signed in.
export const publicMaintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z.string().nullable(),
  roles: z.array(roleSchema)
})

export const getPublicMaintenance = createRoute({
  path: '/maintenance',
  method: 'get',
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(publicMaintenanceSchema, 'Whether maintenance is on, and for which roles')
  }
})

export type GetPublicMaintenanceRoute = typeof getPublicMaintenance
export type GetAdminSettingsRoute = typeof getAdminSettings
export type UpdateAdminSettingsRoute = typeof updateAdminSettings
export type GetMySettingsRoute = typeof getMySettings
export type ResetSchoolYearRoute = typeof resetSchoolYear

export const checkSchoolYearReset = createRoute({
  path: '/settings/school-year/reset/check',
  method: 'post',
  tags,
  security: bearerAuth,
  request: { body: jsonContentRequired(resetSchoolYearSchema.pick({ password: true }), 'The admin password') },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: { description: 'The reset would be accepted now; nothing is deleted' },
    [HttpStatusCodes.FORBIDDEN]: jsonContent(createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN), 'Wrong password or impersonated session'),
    [HttpStatusCodes.CONFLICT]: jsonContent(createErrorMessageSchema(HttpStatusPhrases.CONFLICT), 'The year report was not downloaded by this admin in the last 15 minutes'),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(resetSchoolYearSchema.pick({ password: true })), 'Missing password')
  }
})

export type CheckSchoolYearResetRoute = typeof checkSchoolYearReset
