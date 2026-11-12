// Purpose: FAQ route schemas: the public list, and the admins' editing and ordering.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema, IdUUIDParamsSchema } from '@/lib/openapi/schemas'

const tags = ['FAQ']
const security = [
  { bearerAuth: [] as string[] }
]

export const QUESTION_MAX = 300
export const ANSWER_MAX = 5_000

const unauthorized = jsonContent(createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED), 'Invalid credentials')
const forbidden = jsonContent(createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN), 'Admins only')
const notFound = jsonContent(createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND), 'Question not found')

export const faqSchema = z.object({
  id: z.string(),
  question: z.string(),
  // Markdown.
  answer: z.string(),
  position: z.number().int()
})

export const faqInputSchema = z.object({
  question: z.string().trim().min(1).max(QUESTION_MAX),
  answer: z.string().trim().min(1).max(ANSWER_MAX)
})

export const faqOrderSchema = z.object({
  // Every question's id, in the new order.
  ids: z.array(z.uuid()).min(1)
})

export const list = createRoute({
  path: '/faqs',
  method: 'get',
  tags,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(faqSchema), 'Every question, in page order. Public')
  }
})

export const create = createRoute({
  path: '/faqs',
  method: 'post',
  tags,
  security,
  request: {
    body: jsonContentRequired(faqInputSchema, 'The question to add, at the end')
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(faqSchema, 'The added question'),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(faqInputSchema), 'Validation error(s)'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const update = createRoute({
  path: '/faqs/{id}',
  method: 'put',
  tags,
  security,
  request: {
    params: IdUUIDParamsSchema,
    body: jsonContentRequired(faqInputSchema, 'The question and answer as they should become')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(faqSchema, 'The updated question'),
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(faqInputSchema).or(createErrorSchema(IdUUIDParamsSchema)), 'Validation error(s)'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const remove = createRoute({
  path: '/faqs/{id}',
  method: 'delete',
  tags,
  security,
  request: { params: IdUUIDParamsSchema },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: { description: 'Question deleted; the others close the gap' },
    [HttpStatusCodes.NOT_FOUND]: notFound,
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(IdUUIDParamsSchema), 'Invalid id'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export const reorder = createRoute({
  path: '/faqs/order',
  method: 'put',
  tags,
  security,
  request: {
    body: jsonContentRequired(faqOrderSchema, 'Every question\'s id, in the new order')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(faqSchema), 'Every question, in the new order'),
    [HttpStatusCodes.CONFLICT]: jsonContent(createErrorMessageSchema(HttpStatusPhrases.CONFLICT), 'The ids are not exactly the current questions'),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(faqOrderSchema), 'Validation error(s)'),
    [HttpStatusCodes.FORBIDDEN]: forbidden,
    [HttpStatusCodes.UNAUTHORIZED]: unauthorized
  }
})

export type ListRoute = typeof list
export type CreateRoute = typeof create
export type UpdateRoute = typeof update
export type RemoveRoute = typeof remove
export type ReorderRoute = typeof reorder
