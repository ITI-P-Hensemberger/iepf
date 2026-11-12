// Purpose: Short link route schemas: the admins' list and editing, and the public lookup.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema, IdUUIDParamsSchema } from '@/lib/openapi/schemas'
import { SLUG_MAX, SLUG_PATTERN, slugify } from '@/lib/slug'

const tags = ['Links']
const security = [
  { bearerAuth: [] as string[] }
]

export const URL_MAX = 2_000

const unauthorized = jsonContent(createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED), 'Invalid credentials')
const forbidden = jsonContent(createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN), 'Admins only')
const notFound = jsonContent(createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND), 'Link not found')
const conflict = jsonContent(createErrorMessageSchema('Esiste già un link con questo nome.'), 'Another link has this slug')

function isHttps(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  }
  catch {
    return false
  }
}

export const linkSchema = z.object({
  id: z.string(),
  slug: z.string(),
  url: z.string(),
  active: z.boolean(),
  clicks: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const linkInputSchema = z.object({
  // Formatted here too, so a slug typed without the page's help still comes out clean.
  slug: z.string().max(SLUG_MAX * 2).transform(slugify).pipe(z.string().min(1, 'Scrivi il nome del link.').regex(SLUG_PATTERN)),
  url: z.string().trim().max(URL_MAX).refine(isHttps, 'Il link deve iniziare con https://'),
  active: z.boolean().default(true)
})

const SlugParamsSchema = z.object({
  slug: z.string().regex(SLUG_PATTERN).max(SLUG_MAX).openapi({
    param: { name: 'slug', in: 'path' },
    example: 'iscrizioni'
  })
})

export const list = createRoute({
  path: '/links',
  method: 'get',
  tags,
  security,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(linkSchema), 'Every link, by slug'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const create = createRoute({
  path: '/links',
  method: 'post',
  tags,
  security,
  request: {
    body: jsonContentRequired(linkInputSchema, 'The link to add')
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(linkSchema, 'The added link'),
    [HttpStatusCodes.CONFLICT]: conflict,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(linkInputSchema), 'Validation error(s)'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const update = createRoute({
  path: '/links/{id}',
  method: 'put',
  tags,
  security,
  request: {
    params: IdUUIDParamsSchema,
    body: jsonContentRequired(linkInputSchema, 'The link as it should become')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(linkSchema, 'The updated link'),
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.CONFLICT]: conflict,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(linkInputSchema).or(createErrorSchema(IdUUIDParamsSchema)), 'Validation error(s)'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const remove = createRoute({
  path: '/links/{id}',
  method: 'delete',
  tags,
  security,
  request: { params: IdUUIDParamsSchema },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: { description: 'Link deleted' },
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(IdUUIDParamsSchema), 'Invalid id'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const open = createRoute({
  path: '/links/open/{slug}',
  method: 'post',
  tags,
  request: { params: SlugParamsSchema },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({
      url: z.string()
    }), 'Where the link leads; the click is counted. Public'),
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(SlugParamsSchema), 'Not a slug')
  }
})

export type ListRoute = typeof list
export type CreateRoute = typeof create
export type UpdateRoute = typeof update
export type RemoveRoute = typeof remove
export type OpenRoute = typeof open
