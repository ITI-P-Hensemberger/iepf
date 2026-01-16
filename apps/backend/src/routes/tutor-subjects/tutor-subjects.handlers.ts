// Purpose: Tutor-subject relationship handlers.
import type { Context } from 'hono'

import { and, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { subjects } from '@/db/schemas/subjects.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type {
  AddSubjectToTutorRoute,
  ListSubjectsForTutorRoute,
  ListTutorsForSubjectRoute,
  RemoveSubjectFromTutorRoute
} from './tutor-subjects.routes'

type HandlerContext = Context<AppBindings>

function buildDuplicateTutorSubjectError() {
  return {
    success: false,
    error: {
      issues: [
        {
          code: ZOD_ERROR_CODES.DUPLICATE_KEY,
          path: ['subjectId'],
          message: ZOD_ERROR_MESSAGES.TUTOR_SUBJECT_EXISTS
        }
      ],
      name: 'ZodError'
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === '23505'
}

function forbid(): never {
  throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
    message: HttpStatusPhrases.FORBIDDEN
  })
}

// Only admins or the tutor themselves can modify tutor-subject mappings.
function ensureAdminOrSelfTutor(c: HandlerContext, tutorId: string) {
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }

  if (currentUser.role === 'admin') {
    return currentUser
  }

  if (currentUser.role === 'tutor' && currentUser.id === tutorId) {
    return currentUser
  }

  forbid()
}

async function ensureTutorExists(tutorId: string) {
  const tutor = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.id, tutorId),
        operators.eq(fields.role, 'tutor')
      )
    },
    columns: {
      id: true
    }
  })
  return tutor
}

export const listSubjectsForTutor: AppRouteHandler<ListSubjectsForTutorRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  const tutor = await ensureTutorExists(tutorId)

  if (!tutor) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const rows = await db
    .select({
      id: subjects.id,
      name: subjects.name,
      canonicalName: subjects.canonicalName,
      createdAt: subjects.createdAt,
      updatedAt: subjects.updatedAt
    })
    .from(tutorSubjects)
    .innerJoin(subjects, eq(tutorSubjects.subjectId, subjects.id))
    .where(eq(tutorSubjects.tutorId, tutorId))

  return c.json(rows, HttpStatusCodes.OK)
}

export const listTutorsForSubject: AppRouteHandler<ListTutorsForSubjectRoute> = async (c) => {
  const { subjectId } = c.req.valid('param')
  const subject = await db.query.subjects.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, subjectId)
    },
    columns: { id: true }
  })

  if (!subject) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    })
    .from(tutorSubjects)
    .innerJoin(users, eq(tutorSubjects.tutorId, users.id))
    .where(eq(tutorSubjects.subjectId, subjectId))

  return c.json(rows, HttpStatusCodes.OK)
}

export const addSubjectToTutor: AppRouteHandler<AddSubjectToTutorRoute> = async (c) => {
  const { tutorId } = c.req.valid('param')
  const payload = c.req.valid('json')
  ensureAdminOrSelfTutor(c, tutorId)

  const [tutor, subject] = await Promise.all([
    ensureTutorExists(tutorId),
    db.query.subjects.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, payload.subjectId)
      },
      columns: { id: true }
    })
  ])

  if (!tutor || !subject) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  // Guard against duplicate mappings to return a consistent 409 response.
  const existing = await db.query.tutorSubjects.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.eq(fields.subjectId, payload.subjectId)
      )
    },
    columns: { id: true }
  })

  if (existing) {
    return c.json(buildDuplicateTutorSubjectError(), HttpStatusCodes.CONFLICT)
  }

  try {
    const [inserted] = await db.insert(tutorSubjects).values({
      tutorId,
      subjectId: payload.subjectId
    }).returning({
      tutorId: tutorSubjects.tutorId,
      subjectId: tutorSubjects.subjectId
    })
    return c.json(inserted, HttpStatusCodes.CREATED)
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json(buildDuplicateTutorSubjectError(), HttpStatusCodes.CONFLICT)
    }
    throw error
  }
}

export const removeSubjectFromTutor: AppRouteHandler<RemoveSubjectFromTutorRoute> = async (c) => {
  const { tutorId, subjectId } = c.req.valid('param')
  ensureAdminOrSelfTutor(c, tutorId)

  const existing = await db.query.tutorSubjects.findFirst({
    where(fields, operators) {
      return operators.and(
        operators.eq(fields.tutorId, tutorId),
        operators.eq(fields.subjectId, subjectId)
      )
    },
    columns: { id: true }
  })

  if (!existing) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  await db.delete(tutorSubjects)
    .where(and(eq(tutorSubjects.tutorId, tutorId), eq(tutorSubjects.subjectId, subjectId)))

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
