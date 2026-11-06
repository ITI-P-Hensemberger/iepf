// Purpose: Admin-only stats route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent } from '@/lib/openapi/helpers'
import { createErrorMessageSchema, createPagedListSchema } from '@/lib/openapi/schemas'

const tags = ['AdminStats']
const bearerAuth = [{
  bearerAuth: [] as string[]
}]

const subjectTutorCountSchema = z.object({
  subjectId: z.string(),
  name: z.string(),
  canonicalName: z.string(),
  tutorCount: z.number().int().min(0)
})

const tutorLessonCountSchema = z.object({
  tutorId: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  sectionName: z.string().nullable(),
  countedLessons: z.number().int().min(0),
  lessonsScheduledCounted: z.number().int().min(0),
  lessonsScheduledNotCounted: z.number().int().min(0),
  lessonsConfirmedCounted: z.number().int().min(0),
  lessonsConfirmedNotCounted: z.number().int().min(0),
  lessonsCancelledCounted: z.number().int().min(0),
  lessonsCancelledNotCounted: z.number().int().min(0),
  lessonsCompletedCounted: z.number().int().min(0),
  lessonsCompletedNotCounted: z.number().int().min(0)
})

const studentLessonCountSchema = z.object({
  studentId: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  sectionName: z.string().nullable(),
  countedLessons: z.number().int().min(0),
  lessonsPresentCounted: z.number().int().min(0),
  lessonsPresentNotCounted: z.number().int().min(0),
  lessonsAbsentCounted: z.number().int().min(0),
  lessonsAbsentNotCounted: z.number().int().min(0),
  lessonsWithoutPresenceCounted: z.number().int().min(0),
  lessonsWithoutPresenceNotCounted: z.number().int().min(0)
})

const subjectCountsQuerySchema = z.object({
  q: z.string().min(1).optional(),
  sortBy: z.enum(['name', 'canonicalName', 'tutorCount']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

const lessonCountsQuerySchema = z.object({
  q: z.string().min(1).optional(),
  sortBy: z.enum(['lastName', 'firstName', 'email', 'countedLessons', 'sectionName']).default('lastName'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

const totalCountSchema = z.object({
  total: z.number().int().min(0)
})

const studentStatusCountsSchema = z.object({
  active: z.number().int().min(0),
  inactive: z.number().int().min(0),
  pendingEmailVerification: z.number().int().min(0)
})

const tutorStatusCountsSchema = z.object({
  active: z.number().int().min(0),
  inactive: z.number().int().min(0),
  invites: z.number().int().min(0)
})

const feedbackSummarySchema = z.object({
  total: z.number().int().min(0),
  studentAuthored: z.number().int().min(0),
  tutorAuthored: z.number().int().min(0),
  averageRating: z.number().min(0),
  rating1: z.number().int().min(0),
  rating2: z.number().int().min(0),
  rating3: z.number().int().min(0),
  rating4: z.number().int().min(0),
  rating5: z.number().int().min(0),
  studentToTutorTotal: z.number().int().min(0),
  studentToTutorAverageRating: z.number().min(0),
  studentToTutorRating1: z.number().int().min(0),
  studentToTutorRating2: z.number().int().min(0),
  studentToTutorRating3: z.number().int().min(0),
  studentToTutorRating4: z.number().int().min(0),
  studentToTutorRating5: z.number().int().min(0),
  tutorToStudentTotal: z.number().int().min(0),
  tutorToStudentAverageRating: z.number().min(0),
  tutorToStudentRating1: z.number().int().min(0),
  tutorToStudentRating2: z.number().int().min(0),
  tutorToStudentRating3: z.number().int().min(0),
  tutorToStudentRating4: z.number().int().min(0),
  tutorToStudentRating5: z.number().int().min(0)
})

export const listSubjectTutorCounts = createRoute({
  path: '/admin/stats/subjects-tutor-counts',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: subjectCountsQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(subjectTutorCountSchema),
      'Subject tutor counts'
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

export const listTutorLessonCounts = createRoute({
  path: '/admin/stats/lessons-counts/tutors',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: lessonCountsQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(tutorLessonCountSchema),
      'Tutor counted lessons'
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

export const listStudentLessonCounts = createRoute({
  path: '/admin/stats/lessons-counts/students',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    query: lessonCountsQuerySchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createPagedListSchema(studentLessonCountSchema),
      'Student counted lessons'
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

export const getConfirmedLessonsCount = createRoute({
  path: '/admin/stats/lessons-confirmed/count',
  method: 'get',
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      totalCountSchema,
      'Confirmed lessons count'
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

export const getConfirmedBookingsCount = createRoute({
  path: '/admin/stats/bookings-confirmed/count',
  method: 'get',
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      totalCountSchema,
      'Confirmed bookings count'
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

export const getStudentStatusCounts = createRoute({
  path: '/admin/stats/students/status-counts',
  method: 'get',
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      studentStatusCountsSchema,
      'Student status counts'
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

const pushCoverageSchema = z.array(z.object({
  role: z.enum(['student', 'tutor', 'admin']),
  users: z.number().int().min(0),
  withPush: z.number().int().min(0)
}))

export const getPushCoverage = createRoute({
  path: '/admin/stats/push/coverage',
  method: 'get',
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      pushCoverageSchema,
      'Per role: verified users, and how many receive push on at least one device'
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

export const getTutorStatusCounts = createRoute({
  path: '/admin/stats/tutors/status-counts',
  method: 'get',
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      tutorStatusCountsSchema,
      'Tutor status counts'
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

export const getFeedbackSummary = createRoute({
  path: '/admin/stats/feedback/summary',
  method: 'get',
  tags,
  security: bearerAuth,
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      feedbackSummarySchema,
      'Feedback summary'
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

export type ListSubjectTutorCountsRoute = typeof listSubjectTutorCounts
export type ListTutorLessonCountsRoute = typeof listTutorLessonCounts
export type ListStudentLessonCountsRoute = typeof listStudentLessonCounts
export type GetConfirmedLessonsCountRoute = typeof getConfirmedLessonsCount
export type GetConfirmedBookingsCountRoute = typeof getConfirmedBookingsCount
export type GetStudentStatusCountsRoute = typeof getStudentStatusCounts
export type GetTutorStatusCountsRoute = typeof getTutorStatusCounts
export type GetFeedbackSummaryRoute = typeof getFeedbackSummary
export type GetPushCoverageRoute = typeof getPushCoverage
