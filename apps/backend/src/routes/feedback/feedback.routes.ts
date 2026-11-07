// Purpose: Feedback route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema, createMessageObjectSchema, createPagedListSchema } from '@/lib/openapi/schemas'

const tags = ['Feedback']
const bearerAuth = [{
  bearerAuth: [] as string[]
}]

const LessonIdParamsSchema = z.object({
  lessonId: z.uuid().openapi({
    param: {
      name: 'lessonId',
      in: 'path',
      required: true
    },
    required: ['lessonId'],
    example: 'f9f2245c-5f2f-4a6f-83f8-817adf7a9d41'
  })
})

const FeedbackIdParamsSchema = z.object({
  feedbackId: z.uuid().openapi({
    param: {
      name: 'feedbackId',
      in: 'path',
      required: true
    },
    required: ['feedbackId'],
    example: '2f5a94b2-31ef-4a59-9df2-10f5b0b0f7b3'
  })
})

export const feedbackSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  bookingId: z.string(),
  authorUserId: z.string(),
  targetUserId: z.string(),
  authorRole: z.string(),
  rating: z.number().int(),
  text: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // How many versions the history holds (1: never edited) and who wrote the latest.
  versionCount: z.number().int(),
  lastEditorRole: z.string().nullable(),
  // For the author: until when they may still change it. Null for the admins.
  editableUntil: z.string().nullable(),
  deletedAt: z.string().nullable()
})

export const feedbackHistorySchema = z.object({
  feedbackId: z.string(),
  deletedAt: z.string().nullable(),
  deletedByName: z.string().nullable(),
  versions: z.array(z.object({
    id: z.string(),
    rating: z.number().int(),
    text: z.string().nullable(),
    createdAt: z.string(),
    editorRole: z.string(),
    editorIsAuthor: z.boolean(),
    // Only for the admins.
    editorName: z.string().nullable()
  }))
})

const createLessonFeedbackSchema = z.object({
  bookingId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(1).max(1000).optional()
})

const updateFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  text: z.string().min(1).max(1000).optional()
})

const listMyFeedbackQuerySchema = z.object({
  lessonId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sortBy: z.enum(['createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

const adminListFeedbackQuerySchema = z.object({
  // Free text: the author's or the recipient's name, or the feedback's text.
  q: z.string().trim().min(1).max(100).optional(),
  lessonId: z.uuid().optional(),
  bookingId: z.uuid().optional(),
  authorUserId: z.uuid().optional(),
  targetUserId: z.uuid().optional(),
  authorRole: z.enum(['student', 'tutor']).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  lessonFrom: z.iso.datetime().optional(),
  lessonTo: z.iso.datetime().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  includeDeleted: z.stringbool().optional(),
  sortBy: z.enum(['createdAt', 'rating', 'lessonStartAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

const adminCreateFeedbackSchema = z.object({
  lessonId: z.uuid(),
  bookingId: z.uuid(),
  authorUserId: z.uuid(),
  targetUserId: z.uuid(),
  authorRole: z.enum(['student', 'tutor']),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(1).max(1000).optional()
})

export const createLessonFeedback = createRoute({
  path: '/lessons/{lessonId}/feedback',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema,
    body: jsonContentRequired(createLessonFeedbackSchema, 'Feedback payload')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      feedbackSchema,
      'Created feedback'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.CONFLICT),
      'Lesson not started or feedback already exists'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Access denied'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson or booking not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(createLessonFeedbackSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const updateLessonFeedback = createRoute({
  path: '/lessons/{lessonId}/feedback/{feedbackId}',
  method: 'patch',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema.extend(FeedbackIdParamsSchema.shape),
    body: jsonContentRequired(updateFeedbackSchema, 'Feedback update payload')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      feedbackSchema,
      'Updated feedback'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.CONFLICT),
      'Lesson not started'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Access denied'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Feedback not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(updateFeedbackSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const listMyFeedback = createRoute({
  path: '/feedback/me',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: listMyFeedbackQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(feedbackSchema),
      'Feedback written by the current user'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Access denied'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(listMyFeedbackQuerySchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const adminListFeedback = createRoute({
  path: '/feedback',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: adminListFeedbackQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(feedbackSchema),
      'Feedback list'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(adminListFeedbackQuerySchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const adminGetFeedback = createRoute({
  path: '/feedback/{feedbackId}',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: FeedbackIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      feedbackSchema,
      'Feedback entry'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Feedback not found'
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

export const adminCreateFeedback = createRoute({
  path: '/feedback',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    body: jsonContentRequired(adminCreateFeedbackSchema, 'Admin feedback payload')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      feedbackSchema,
      'Created feedback'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.CONFLICT),
      'Lesson not started or feedback already exists'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson or booking not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(adminCreateFeedbackSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const adminUpdateFeedback = createRoute({
  path: '/feedback/{feedbackId}',
  method: 'patch',
  tags,
  security: bearerAuth,
  request: {
    params: FeedbackIdParamsSchema,
    body: jsonContentRequired(updateFeedbackSchema, 'Admin feedback update payload')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      feedbackSchema,
      'Updated feedback'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.CONFLICT),
      'Lesson not started'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Feedback not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(updateFeedbackSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const adminDeleteFeedback = createRoute({
  path: '/feedback/{feedbackId}',
  method: 'delete',
  tags,
  security: bearerAuth,
  request: {
    params: FeedbackIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema('Feedback deleted.'),
      'Feedback deleted'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Feedback not found'
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

export const getFeedbackHistory = createRoute({
  path: '/feedback/{feedbackId}/history',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: FeedbackIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      feedbackHistorySchema,
      'Every version of the feedback, newest first'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Feedback not found, or not written by the current user'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Access denied'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type GetFeedbackHistoryRoute = typeof getFeedbackHistory
export type CreateLessonFeedbackRoute = typeof createLessonFeedback
export type UpdateLessonFeedbackRoute = typeof updateLessonFeedback
export type ListMyFeedbackRoute = typeof listMyFeedback
export type AdminListFeedbackRoute = typeof adminListFeedback
export type AdminGetFeedbackRoute = typeof adminGetFeedback
export type AdminCreateFeedbackRoute = typeof adminCreateFeedback
export type AdminUpdateFeedbackRoute = typeof adminUpdateFeedback
export type AdminDeleteFeedbackRoute = typeof adminDeleteFeedback
