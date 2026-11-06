// Purpose: Popup route schemas and OpenAPI metadata, for viewers and for admins.
import { createRoute, z } from '@hono/zod-openapi'

import { ANNOUNCEMENT_DISMISS_MODES } from '@/db/schemas/announcements.schema'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema, IdUUIDParamsSchema } from '@/lib/openapi/schemas'

const tags = ['Announcements']
const security = [{ bearerAuth: [] as string[] }]

export const ANNOUNCEMENT_ROLES = ['student', 'tutor', 'admin'] as const
export const TITLE_MAX = 120
export const BODY_MAX = 5_000
export const LINK_LABEL_MAX = 40

const unauthorized = jsonContent(createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED), 'Invalid credentials')
const forbidden = jsonContent(createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN), 'Not allowed for this role')
const notFound = jsonContent(createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND), 'Popup not found')

// Only https links or paths inside IEPF: never javascript:, data: or protocol-relative //host.
export function isAllowedLink(value: string) {
  if (value.startsWith('/')) {
    return !value.startsWith('//') && !value.startsWith('/\\')
  }
  try {
    return new URL(value).protocol === 'https:'
  }
  catch {
    return false
  }
}

const dateField = z.iso.datetime({ offset: true }).nullable()

export const announcementInputSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  body: z.string().trim().min(1).max(BODY_MAX),
  linkUrl: z.string().trim().max(2048).refine(isAllowedLink, 'Link non valido: usa https:// o un percorso che inizia con /').nullable(),
  linkLabel: z.string().trim().min(1).max(LINK_LABEL_MAX).nullable(),
  roles: z.array(z.enum(ANNOUNCEMENT_ROLES)).min(1).refine(roles => new Set(roles).size === roles.length, 'Ruoli ripetuti'),
  dismissMode: z.enum(ANNOUNCEMENT_DISMISS_MODES),
  active: z.boolean(),
  startsAt: dateField,
  expiresAt: dateField
}).refine(
  value => !value.startsAt || !value.expiresAt || new Date(value.expiresAt) > new Date(value.startsAt),
  { message: 'La scadenza deve essere dopo l\'inizio', path: ['expiresAt'] }
).refine(
  value => value.linkLabel === null || value.linkUrl !== null,
  { message: 'Il testo del bottone serve solo con un link', path: ['linkLabel'] }
)

// What a viewer receives: no audience or authorship details.
export const activeAnnouncementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  linkUrl: z.string().nullable(),
  linkLabel: z.string().nullable(),
  dismissMode: z.enum(ANNOUNCEMENT_DISMISS_MODES)
})

export const adminAnnouncementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  linkUrl: z.string().nullable(),
  linkLabel: z.string().nullable(),
  roles: z.array(z.enum(ANNOUNCEMENT_ROLES)),
  dismissMode: z.enum(ANNOUNCEMENT_DISMISS_MODES),
  active: z.boolean(),
  startsAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  dismissals: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const listActive = createRoute({
  path: '/announcements/active',
  method: 'get',
  tags,
  security,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(activeAnnouncementSchema), 'Popups to show the current user, oldest first'),
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const dismiss = createRoute({
  path: '/announcements/{id}/dismiss',
  method: 'post',
  tags,
  security,
  request: { params: IdUUIDParamsSchema },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: { description: 'Closed for good; nothing is stored while impersonating' },
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(IdUUIDParamsSchema), 'Invalid id'),
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const adminList = createRoute({
  path: '/admin/announcements',
  method: 'get',
  tags,
  security,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(adminAnnouncementSchema), 'Every popup, newest first'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const adminCreate = createRoute({
  path: '/admin/announcements',
  method: 'post',
  tags,
  security,
  request: { body: jsonContentRequired(announcementInputSchema, 'The popup to create') },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(adminAnnouncementSchema, 'The created popup'),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(announcementInputSchema), 'Validation error(s)'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const adminUpdate = createRoute({
  path: '/admin/announcements/{id}',
  method: 'put',
  tags,
  security,
  request: {
    params: IdUUIDParamsSchema,
    body: jsonContentRequired(announcementInputSchema, 'The whole popup, as it should become')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(adminAnnouncementSchema, 'The updated popup'),
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(announcementInputSchema), 'Validation error(s)'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const adminDelete = createRoute({
  path: '/admin/announcements/{id}',
  method: 'delete',
  tags,
  security,
  request: { params: IdUUIDParamsSchema },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: { description: 'Popup deleted with its dismissals' },
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(IdUUIDParamsSchema), 'Invalid id'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export type ListActiveRoute = typeof listActive
export type DismissRoute = typeof dismiss
export type AdminListRoute = typeof adminList
export type AdminCreateRoute = typeof adminCreate
export type AdminUpdateRoute = typeof adminUpdate
export type AdminDeleteRoute = typeof adminDelete
