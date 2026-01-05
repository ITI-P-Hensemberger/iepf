// Purpose: Lesson booking route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorSchema, createMessageObjectSchema } from '@/lib/openapi/schemas'

const tags = ['Lessons']
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

export const lessonSchema = z.object({
  id: z.string(),
  tutorId: z.string(),
  subjectId: z.string(),
  startAt: z.string(),
  durationMinutes: z.number().int(),
  seats: z.number().int(),
  status: z.string()
})

export const bookingSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  studentId: z.string(),
  topic: z.string(),
  status: z.string()
})

const confirmationBodySchema = z.object({
  completed: z.boolean(),
  note: z.string().min(1).max(500).optional()
})

const lessonConfirmationSchema = z.object({
  status: z.string(),
  tutorConfirmed: z.boolean().nullable(),
  tutorConfirmedAt: z.string().nullable()
})

const bookingConfirmationSchema = z.object({
  status: z.string(),
  studentConfirmed: z.boolean().nullable(),
  studentConfirmedAt: z.string().nullable()
})

const resolveLessonSchema = z.object({
  action: z.enum(['complete', 'cancel']),
  note: z.string().min(1).max(500).optional()
})

const rescheduleLessonSchema = z.object({
  availabilityId: z.uuid(),
  note: z.string().min(1).max(500).optional()
})

const overrideConfirmationsSchema = z.object({
  tutorConfirmed: z.boolean().optional(),
  tutorNote: z.string().min(1).max(500).optional(),
  bookings: z.array(z.object({
    bookingId: z.uuid(),
    completed: z.boolean(),
    note: z.string().min(1).max(500).optional()
  })).optional()
})

const confirmationListQuerySchema = z.object({
  state: z.enum(['pending', 'stalled']).default('pending')
})

const confirmationListItemSchema = z.object({
  id: z.string(),
  tutorId: z.string(),
  subjectId: z.string(),
  startAt: z.string(),
  durationMinutes: z.number().int(),
  status: z.string(),
  tutorConfirmed: z.boolean().nullable(),
  bookedCount: z.number().int(),
  confirmedCount: z.number().int()
})

const confirmationDetailSchema = z.object({
  lesson: z.object({
    id: z.string(),
    tutorId: z.string(),
    subjectId: z.string(),
    startAt: z.string(),
    durationMinutes: z.number().int(),
    status: z.string(),
    tutorConfirmed: z.boolean().nullable(),
    tutorConfirmedAt: z.string().nullable(),
    tutorConfirmationNote: z.string().nullable()
  }),
  bookings: z.array(z.object({
    id: z.string(),
    studentId: z.string(),
    status: z.string(),
    studentConfirmed: z.boolean().nullable(),
    studentConfirmedAt: z.string().nullable(),
    studentConfirmationNote: z.string().nullable()
  }))
})

const bookLessonSchema = z.object({
  availabilityId: z.uuid(),
  subjectId: z.uuid(),
  topic: z.string().min(1).max(200)
})

export const bookLesson = createRoute({
  path: '/tutors/{tutorId}/lessons/book',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema,
    body: jsonContentRequired(
      bookLessonSchema,
      'Lesson booking payload'
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
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Tutor or subject not found'
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.BAD_REQUEST),
      'Slot unavailable'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.CONFLICT),
      'Slot already booked or full'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Student access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(bookLessonSchema).or(createErrorSchema(TutorIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const cancelBooking = createRoute({
  path: '/lessons/{lessonId}/bookings/{bookingId}',
  method: 'delete',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema.extend(BookingIdParamsSchema.shape)
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'Booking canceled'
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Booking not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or booking owner required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(LessonIdParamsSchema.extend(BookingIdParamsSchema.shape)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
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
    params: LessonIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema('Lesson canceled'),
      'Lesson canceled'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(LessonIdParamsSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const listLessonConfirmations = createRoute({
  path: '/lessons/confirmations',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: confirmationListQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(confirmationListItemSchema),
      'Lessons awaiting confirmation'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(confirmationListQuerySchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const getLessonConfirmations = createRoute({
  path: '/lessons/{lessonId}/confirmations',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      confirmationDetailSchema,
      'Lesson confirmation details'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(LessonIdParamsSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const resolveLesson = createRoute({
  path: '/lessons/{lessonId}/resolve',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema,
    body: jsonContentRequired(
      resolveLessonSchema,
      'Admin resolution payload'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema('Lesson resolved'),
      'Lesson resolved'
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.BAD_REQUEST),
      'Lesson not eligible for resolution'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.CONFLICT),
      'Lesson already finalized'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(resolveLessonSchema).or(createErrorSchema(LessonIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
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
      createMessageObjectSchema('Lesson rescheduled'),
      'Lesson rescheduled'
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.BAD_REQUEST),
      'Availability invalid'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.CONFLICT),
      'Lesson already finalized or slot unavailable'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson or availability not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(rescheduleLessonSchema).or(createErrorSchema(LessonIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const overrideLessonConfirmations = createRoute({
  path: '/lessons/{lessonId}/confirmations/override',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema,
    body: jsonContentRequired(
      overrideConfirmationsSchema,
      'Admin confirmation override payload'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      confirmationDetailSchema,
      'Lesson confirmations updated'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.CONFLICT),
      'Lesson already finalized'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(overrideConfirmationsSchema).or(createErrorSchema(LessonIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const confirmLessonTutor = createRoute({
  path: '/lessons/{lessonId}/confirm/tutor',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema,
    body: jsonContentRequired(
      confirmationBodySchema,
      'Tutor confirmation payload'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      lessonConfirmationSchema,
      'Lesson confirmation recorded'
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.BAD_REQUEST),
      'Lesson not eligible for confirmation'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.CONFLICT),
      'Lesson already confirmed'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Lesson not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Tutor access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(confirmationBodySchema).or(createErrorSchema(LessonIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const confirmLessonBooking = createRoute({
  path: '/lessons/{lessonId}/bookings/{bookingId}/confirm',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema.extend(BookingIdParamsSchema.shape),
    body: jsonContentRequired(
      confirmationBodySchema,
      'Student confirmation payload'
    )
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.object({
        lesson: lessonConfirmationSchema,
        booking: bookingConfirmationSchema
      }),
      'Booking confirmation recorded'
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.BAD_REQUEST),
      'Lesson not eligible for confirmation'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.CONFLICT),
      'Booking already confirmed'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.NOT_FOUND),
      'Booking not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Student access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(confirmationBodySchema).or(
        createErrorSchema(LessonIdParamsSchema.extend(BookingIdParamsSchema.shape))
      ),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type BookLessonRoute = typeof bookLesson
export type CancelBookingRoute = typeof cancelBooking
export type CancelLessonRoute = typeof cancelLesson
export type ListLessonConfirmationsRoute = typeof listLessonConfirmations
export type GetLessonConfirmationsRoute = typeof getLessonConfirmations
export type ResolveLessonRoute = typeof resolveLesson
export type RescheduleLessonRoute = typeof rescheduleLesson
export type OverrideLessonConfirmationsRoute = typeof overrideLessonConfirmations
export type ConfirmLessonTutorRoute = typeof confirmLessonTutor
export type ConfirmLessonBookingRoute = typeof confirmLessonBooking
