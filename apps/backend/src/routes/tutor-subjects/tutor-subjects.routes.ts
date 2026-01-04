// Purpose: Tutor-subject relationship route schemas and OpenAPI metadata.
import { createRoute, z } from '@hono/zod-openapi'

import { selectSubjectsSchema } from '@/db/schemas/subjects.schema'
import { selectUsersSchema } from '@/db/schemas/users.schema'
import { notFoundSchema } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { jsonContent, jsonContentRequired } from '@/lib/openapi/helpers'
import { createErrorSchema, createMessageObjectSchema } from '@/lib/openapi/schemas'

const tags = ['TutorSubjects']
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

const SubjectIdParamsSchema = z.object({
  subjectId: z.uuid().openapi({
    param: {
      name: 'subjectId',
      in: 'path',
      required: true
    },
    required: ['subjectId'],
    example: '0ff9f84c-7ad1-45b4-8c7c-c7c3f9c2d6d5'
  })
})

const TutorSubjectParamsSchema = TutorIdParamsSchema.merge(SubjectIdParamsSchema)

const tutorSubjectBodySchema = z.object({
  subjectId: z.uuid()
})

const tutorSubjectResponseSchema = z.object({
  tutorId: z.string(),
  subjectId: z.string()
})

export const listSubjectsForTutor = createRoute({
  path: '/tutors/{tutorId}/subjects',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(selectSubjectsSchema),
      'Subjects taught by the tutor'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'Tutor not found'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const listTutorsForSubject = createRoute({
  path: '/subjects/{subjectId}/tutors',
  method: 'get',
  tags,
  security: bearerAuth,
  request: {
    params: SubjectIdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      z.array(selectUsersSchema),
      'Tutors for the subject'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'Subject not found'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const addSubjectToTutor = createRoute({
  path: '/tutors/{tutorId}/subjects',
  method: 'post',
  tags,
  security: bearerAuth,
  request: {
    params: TutorIdParamsSchema,
    body: jsonContentRequired(
      tutorSubjectBodySchema,
      'Subject assignment'
    )
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(
      tutorSubjectResponseSchema,
      'Subject assigned'
    ),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'Tutor or subject not found'
    ),
    [HttpStatusCodes.CONFLICT]: jsonContent(
      createErrorSchema(z.object({ subjectId: z.string().min(1) })),
      'Subject already assigned'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or self access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(tutorSubjectBodySchema).or(createErrorSchema(TutorIdParamsSchema)),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export const removeSubjectFromTutor = createRoute({
  path: '/tutors/{tutorId}/subjects/{subjectId}',
  method: 'delete',
  tags,
  security: bearerAuth,
  request: {
    params: TutorSubjectParamsSchema
  },
  responses: {
    [HttpStatusCodes.NO_CONTENT]: {
      description: 'Subject removed from tutor'
    },
    [HttpStatusCodes.NOT_FOUND]: jsonContent(
      notFoundSchema,
      'Tutor, subject, or assignment not found'
    ),
    [HttpStatusCodes.FORBIDDEN]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.FORBIDDEN),
      'Admin or self access required'
    ),
    [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
      createErrorSchema(TutorSubjectParamsSchema),
      'Validation error(s)'
    ),
    [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
      createMessageObjectSchema(HttpStatusPhrases.UNAUTHORIZED),
      'Invalid credentials'
    )
  }
})

export type ListSubjectsForTutorRoute = typeof listSubjectsForTutor
export type ListTutorsForSubjectRoute = typeof listTutorsForSubject
export type AddSubjectToTutorRoute = typeof addSubjectToTutor
export type RemoveSubjectFromTutorRoute = typeof removeSubjectFromTutor
