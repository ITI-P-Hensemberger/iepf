// Purpose: Lesson booking route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createErrorSchema, createMessageObjectSchema, createPagedListSchema } from '@/lib/openapi/schemas'

const tags = ['Lessons']
const bearerAuth = [
  {
    bearerAuth: [] as string[]
  }
]

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

const subjectOptionSchema = z.object({
  id: z.string(),
  name: z.string()
})

export const lessonSchema = z.object({
  id: z.string(),
  tutorId: z.string(),
  // null while the lesson is open: the first booking picks one of the tutor's subjects.
  subjectId: z.string().nullable(),
  startAt: z.string(),
  durationMinutes: z.number().int(),
  lessonCapacity: z.number().int(),
  dailyCapacity: z.number().int(),
  dailyOccupancy: z.number().int(),
  availableSeats: z.number().int(),
  countsForTutor: z.boolean(),
  status: z.string(),
  subjectFromBooking: z.boolean(),
  subjectOptions: z.array(subjectOptionSchema).optional()
})

export const bookingSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  studentId: z.string(),
  subjectId: z.string(),
  topic: z.string(),
  status: z.string(),
  countsForStudent: z.boolean(),
  studentPresence: z.boolean().nullable(),
  studentPresenceAt: z.string().nullable()
})

// Without a subject an admin's lesson starts open, like a generated one: the first booking picks it.
const createLessonSchema = z.object({
  tutorId: z.uuid(),
  subjectId: z.uuid().nullable().optional(),
  startAt: z.iso.datetime(),
  durationMinutes: z.number().int()
})

const rescheduleLessonSchema = z.object({
  tutorId: z.uuid(),
  // null keeps the subject open for bookings to choose.
  subjectId: z.uuid().nullable(),
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
  // Required on an open lesson; on a lesson with a subject it must match it.
  subjectId: z.uuid().optional(),
  studentId: z.uuid().optional()
})

const myLessonsQuerySchema = z.object({
  // Admins only: whose bookings to list, for the student's page in the admin area.
  studentId: z.uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  lessonStatus: z.string().optional(),
  bookingStatus: z.string().optional(),
  sortBy: z.enum(['startAt']).default('startAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

const availableLessonsQuerySchema = z.object({
  subjectId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sortBy: z.enum(['startAt']).default('startAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

const listLessonsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
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
  subjectId: z.string().nullable(),
  startAt: z.string(),
  durationMinutes: z.number().int(),
  lessonCapacity: z.number().int(),
  dailyCapacity: z.number().int(),
  dailyOccupancy: z.number().int(),
  availableSeats: z.number().int(),
  countsForTutor: z.boolean(),
  status: z.string(),
  subjectFromBooking: z.boolean()
})

const myLessonItemSchema = z.object({
  id: z.string(),
  tutorId: z.string(),
  tutorFirstName: z.string(),
  tutorLastName: z.string(),
  tutorEmail: z.string().nullable(),
  subjectId: z.string(),
  subjectName: z.string(),
  startAt: z.string(),
  durationMinutes: z.number().int(),
  lessonStatus: z.string(),
  bookingId: z.string(),
  bookingStatus: z.string(),
  topic: z.string(),
  countsForStudent: z.boolean(),
  studentPresence: z.boolean().nullable(),
  studentPresenceAt: z.string().nullable()
})

const availableLessonItemSchema = z.object({
  id: z.string(),
  tutorId: z.string(),
  tutorFirstName: z.string(),
  tutorLastName: z.string(),
  tutorYear: z.number().int().nullable(),
  subjectId: z.string().nullable(),
  subjectName: z.string().nullable(),
  startAt: z.string(),
  durationMinutes: z.number().int(),
  lessonCapacity: z.number().int(),
  dailyCapacity: z.number().int(),
  dailyOccupancy: z.number().int(),
  availableSeats: z.number().int(),
  status: z.string(),
  // Students book until 20:00 of the day before.
  bookingCutoff: z.string(),
  // What a booking may pick: the tutor's subjects while the lesson is open, else its subject.
  subjectOptions: z.array(subjectOptionSchema),
  canBook: z.boolean()
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

export const listMyLessons = createRoute({
  path: '/lessons/me',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: myLessonsQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(myLessonItemSchema),
      'Lessons booked by the current student'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Student access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(myLessonsQuerySchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const listAvailableLessons = createRoute({
  path: '/lessons/available',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: availableLessonsQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(availableLessonItemSchema),
      'Lessons available for booking'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Student access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(availableLessonsQuerySchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

const availableSummaryQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  subjectId: z.uuid().optional()
})

const availableSummarySchema = z.object({
  // Bookable lessons per subject: an open lesson counts once for each subject its tutor teaches.
  subjects: z.array(z.object({
    id: z.string(),
    name: z.string(),
    count: z.number().int()
  })),
  // Per school day (YYYY-MM-DD): bookable lessons for the subject, and whether the student already has one.
  days: z.array(z.object({
    day: z.string(),
    count: z.number().int(),
    booked: z.boolean()
  }))
})

export const getAvailableSummary = createRoute({
  path: '/lessons/available/summary',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: availableSummaryQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(availableSummarySchema, 'Bookable lesson counts per subject and day'),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Student access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(availableSummaryQuerySchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

const scheduleQuerySchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  tutorId: z.uuid().optional(),
  subjectId: z.uuid().optional()
})

const scheduleItemSchema = z.object({
  id: z.string(),
  tutorId: z.string(),
  tutorName: z.string(),
  tutorYear: z.number().int().nullable(),
  tutorDailyCapacity: z.number().int(),
  subjectId: z.string().nullable(),
  subjectName: z.string().nullable(),
  subjectFromBooking: z.boolean(),
  // The tutor's subjects while the lesson is still open.
  subjectOptions: z.array(subjectOptionSchema),
  startAt: z.string(),
  durationMinutes: z.number().int(),
  seats: z.number().int(),
  status: z.string(),
  bookingsOpen: z.boolean(),
  bookings: z.array(z.object({
    id: z.string(),
    studentId: z.string(),
    studentName: z.string(),
    classLabel: z.string().nullable(),
    subjectId: z.string(),
    topic: z.string(),
    studentPresence: z.boolean().nullable()
  }))
})

export const listSchedule = createRoute({
  path: '/lessons/schedule',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: scheduleQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({
      data: z.array(scheduleItemSchema)
    }), 'Lessons with their confirmed bookings, for up to 15 days'),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.BAD_REQUEST),
      'Range longer than 15 days'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or tutor access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(scheduleQuerySchema),
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
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Only admins and the lesson\'s tutor; the message says when it went to another tutor'
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
      'Lesson not available for booking or topic invalid'
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
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.BAD_REQUEST),
      'Topic invalid'
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

const lessonVersionSchema = z.object({
  startAt: z.string(),
  durationMinutes: z.number(),
  tutorId: z.string(),
  tutorName: z.string(),
  subjectId: z.string().nullable(),
  subjectName: z.string().nullable()
})

const lessonChangeSchema = z.object({
  id: z.string(),
  before: lessonVersionSchema,
  after: lessonVersionSchema,
  actorName: z.string(),
  actorRole: z.string(),
  createdAt: z.date()
})

export const lessonHistory = createRoute({
  path: '/lessons/{lessonId}/history',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: LessonIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.array(lessonChangeSchema), 'Reschedules of the lesson, oldest first'),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(createErrorSchema(LessonIdParamsSchema), 'Invalid id error'),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const createLesson = createRoute({
  path: '/lessons',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    body: jsonContentRequired(
      createLessonSchema,
      'Admin lesson payload'
    )
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      z.object({
        message: z.string(),
        lessonId: z.string()
      }),
      'Lezione creata'
    ),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.BAD_REQUEST),
      'Lesson details invalid'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createErrorMessageSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(createLessonSchema),
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
export type ListMyLessonsRoute = typeof listMyLessons
export type ListAvailableLessonsRoute = typeof listAvailableLessons
export type ListLessonBookingsRoute = typeof listLessonBookings
export type BookGeneratedLessonRoute = typeof bookGeneratedLesson
export type CancelBookingRoute = typeof cancelBooking
export type CancelLessonRoute = typeof cancelLesson
export type RescheduleLessonRoute = typeof rescheduleLesson
export type LessonHistoryRoute = typeof lessonHistory
export type SetBookingPresenceRoute = typeof setBookingPresence
export type UpdateBookingTopicRoute = typeof updateBookingTopic
export type UpdateLessonCountsRoute = typeof updateLessonCounts
export type UpdateBookingCountsRoute = typeof updateBookingCounts
export type CreateLessonRoute = typeof createLesson
export type GetAvailableSummaryRoute = typeof getAvailableSummary
export type ListScheduleRoute = typeof listSchedule
