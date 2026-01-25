// Purpose: Lesson booking route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema, createMessageObjectSchema, createPagedListSchema } from '@/lib/openapi/schemas'

const tags = ['Lessons']
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

const BookingIdParamsSchema = z.object({
  bookingId: z.uuid().openapi({
    param: {
      name: 'bookingId',
      in: 'path',
      required: true
    },
    required: ['bookingId'],
    example: '2f5a94b2-31ef-4a59-9df2-10f5b0b0f7b3'
  })
})

const bookingTopicSchema = z.object({
  topic: z.string().min(1).max(200)
})

export const lessonSchema = z.object({
  id: z.string(),
  tutorId: z.string(),
  subjectId: z.string(),
  startAt: z.string(),
  durationMinutes: z.number().int(),
  lessonCapacity: z.number().int(),
  dailyCapacity: z.number().int(),
  dailyOccupancy: z.number().int(),
  availableSeats: z.number().int(),
  countsForTutor: z.boolean(),
  status: z.string()
})

export const bookingSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  studentId: z.string(),
  topic: z.string(),
  status: z.string(),
  countsForStudent: z.boolean(),
  studentPresence: z.boolean().nullable(),
  studentPresenceAt: z.string().nullable()
})

const rescheduleLessonSchema = z.object({
  tutorId: z.uuid(),
  subjectId: z.uuid(),
  startAt: z.iso.datetime(),
  durationMinutes: z.number().int()
})

const cancelLessonSchema = z.object({
  countsForTutor: z.boolean().optional()
}).optional()

const cancelBookingSchema = z.object({
  countsForStudent: z.boolean().optional()
}).optional()

const lessonCountsSchema = z.object({
  countsForTutor: z.boolean()
})

const bookingCountsSchema = z.object({
  countsForStudent: z.boolean()
})

const presenceSchema = z.object({
  present: z.boolean().nullable()
})

const bookGeneratedLessonSchema = z.object({
  topic: z.string().min(1).max(200),
  studentId: z.uuid().optional()
})

const listLessonsQuerySchema = z.object({
  q: z.string().min(1).optional(),
  tutorId: z.uuid().optional(),
  subjectId: z.uuid().optional(),
  status: z.string().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sortBy: z.enum(['startAt', 'createdAt']).default('startAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

const lessonListItemSchema = z.object({
  id: z.string(),
  tutorId: z.string(),
  subjectId: z.string(),
  startAt: z.string(),
  durationMinutes: z.number().int(),
  lessonCapacity: z.number().int(),
  dailyCapacity: z.number().int(),
  dailyOccupancy: z.number().int(),
  availableSeats: z.number().int(),
  countsForTutor: z.boolean(),
  status: z.string()
})

export const listLessons = createRoute({
  path: '/lessons',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: listLessonsQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(lessonListItemSchema),
      'List of scheduled lessons with available seats'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Authenticated access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(listLessonsQuerySchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const getLesson = createRoute({
  path: '/lessons/{lessonId}',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      lessonSchema,
      'Lesson details'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(LessonIdParamsSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const listLessonBookings = createRoute({
  path: '/lessons/{lessonId}/bookings',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(bookingSchema),
      'Lesson bookings'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Access denied'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(LessonIdParamsSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const bookGeneratedLesson = createRoute({
  path: '/lessons/{lessonId}/book',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema,
    body: jsonContentRequired(
      bookGeneratedLessonSchema,
      'Booking payload'
    )
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      z.object({
        lesson: lessonSchema,
        booking: bookingSchema
      }),
      'Lesson booked'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.BAD_REQUEST),
      'Lesson not available for booking'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.CONFLICT),
      'Already booked or no seats available'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Student access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(bookGeneratedLessonSchema).or(createErrorSchema(LessonIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})
export const cancelBooking = createRoute({
  path: '/lessons/{lessonId}/bookings/{bookingId}/cancel',
  method: 'patch',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema.extend(BookingIdParamsSchema.shape),
    body: jsonContent(cancelBookingSchema, 'Cancel booking payload')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      bookingSchema,
      'Booking canceled'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.CONFLICT),
      'Booking already canceled'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Booking not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or booking owner required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(LessonIdParamsSchema.extend(BookingIdParamsSchema.shape)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const cancelLesson = createRoute({
  path: '/lessons/{lessonId}/cancel',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema,
    body: jsonContent(cancelLessonSchema, 'Cancel lesson payload')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema('Lezione annullata'),
      'Lezione annullata'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(LessonIdParamsSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const updateLessonCounts = createRoute({
  path: '/lessons/{lessonId}/counts',
  method: 'patch',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema,
    body: jsonContentRequired(lessonCountsSchema, 'Lesson counts payload')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      lessonSchema,
      'Lesson updated'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(lessonCountsSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const rescheduleLesson = createRoute({
  path: '/lessons/{lessonId}/reschedule',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema,
    body: jsonContentRequired(
      rescheduleLessonSchema,
      'Admin reschedule payload'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        message: z.string(),
        lessonId: z.string()
      }),
      'Lezione riprogrammata'
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.BAD_REQUEST),
      'Lesson details invalid'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.CONFLICT),
      'Lesson already finalized'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(rescheduleLessonSchema).or(createErrorSchema(LessonIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const setBookingPresence = createRoute({
  path: '/lessons/{lessonId}/bookings/{bookingId}/presence',
  method: 'patch',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema.extend(BookingIdParamsSchema.shape),
    body: jsonContentRequired(
      presenceSchema,
      'Student presence payload'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        status: z.string(),
        studentPresence: z.boolean().nullable(),
        studentPresenceAt: z.string().nullable()
      }),
      'Student presence recorded'
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.BAD_REQUEST),
      'Presence window closed'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.CONFLICT),
      'Booking not eligible'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson or booking not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Tutor access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(presenceSchema).or(
        createErrorSchema(LessonIdParamsSchema.extend(BookingIdParamsSchema.shape))
      ),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const updateBookingTopic = createRoute({
  path: '/lessons/{lessonId}/bookings/{bookingId}/topic',
  method: 'patch',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema.extend(BookingIdParamsSchema.shape),
    body: jsonContentRequired(bookingTopicSchema, 'Booking topic payload')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      bookingSchema,
      'Updated booking'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Booking not found'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(bookingTopicSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const updateBookingCounts = createRoute({
  path: '/lessons/{lessonId}/bookings/{bookingId}/counts',
  method: 'patch',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema.extend(BookingIdParamsSchema.shape),
    body: jsonContentRequired(bookingCountsSchema, 'Booking counts payload')
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      bookingSchema,
      'Booking updated'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.NOT_FOUND),
      'Booking not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(bookingCountsSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type ListLessonsRoute = typeof listLessons
export type GetLessonRoute = typeof getLesson
export type ListLessonBookingsRoute = typeof listLessonBookings
export type BookGeneratedLessonRoute = typeof bookGeneratedLesson
export type CancelBookingRoute = typeof cancelBooking
export type CancelLessonRoute = typeof cancelLesson
export type RescheduleLessonRoute = typeof rescheduleLesson
export type SetBookingPresenceRoute = typeof setBookingPresence
export type UpdateBookingTopicRoute = typeof updateBookingTopic
export type UpdateLessonCountsRoute = typeof updateLessonCounts
export type UpdateBookingCountsRoute = typeof updateBookingCounts
