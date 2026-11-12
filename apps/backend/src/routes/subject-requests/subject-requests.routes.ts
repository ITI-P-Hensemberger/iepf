// Purpose: Subject request route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import { selectSubjectRequestsSchema } from '@/db/schemas/subject-requests.schema'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema, createPagedListSchema } from '@/lib/openapi/schemas'

const tags = ['SubjectRequests']
const bearerAuth = [
  {
    bearerAuth: [] as string[]
  }
]

const subjectRequestListItemSchema = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  subjectId: z.uuid(),
  subjectName: z.string(),
  canonicalName: z.string(),
  createdAt: z.string(),
  studentEmail: z.email().nullable(),
  studentFirstName: z.string().nullable(),
  studentLastName: z.string().nullable()
})

const subjectRequestSummarySchema = z.object({
  subjectName: z.string(),
  canonicalName: z.string(),
  requestCount: z.number().int().min(0)
})

const listQuerySchema = z.object({
  q: z.string().min(1).optional(),
  studentId: z.uuid().optional(),
  subjectId: z.uuid().optional(),
  mode: z.enum(['raw', 'summary']).default('raw'),
  sortBy: z.enum([
    'createdAt',
    'subjectName',
    'canonicalName',
    'studentEmail',
    'studentFirstName',
    'studentLastName',
    'requestCount'
  ]).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

export const list = createRoute({
  path: '/subject-requests',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: listQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.union([
        createPagedListSchema(subjectRequestListItemSchema),
        createPagedListSchema(subjectRequestSummarySchema)
      ]),
      'Subject request list (raw or summary)'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(listQuerySchema),
      'Invalid query parameters'
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

const createBodySchema = z.object({
  subjectId: z.uuid()
})

export const create = createRoute({
  path: '/subject-requests',
  method: 'post',
  request: {
    body: jsonContentRequired(
      createBodySchema,
      'The subject request to create'
    )
  },
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      selectSubjectRequestsSchema,
      'The created subject request'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(createBodySchema),
      'The validation error(s)'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Subject not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Student access required'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type ListRoute = typeof list
export type CreateRoute = typeof create
