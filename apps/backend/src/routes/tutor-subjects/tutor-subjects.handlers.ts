// Purpose: Tutor-subject relationship handlers.
import type { Context } from 'hono'

import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { subjects } from '@/db/schemas/subjects.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { buildPagedResponse } from '@/lib/pagination'

import type {
  AddSubjectToTutorRoute,
  ListSubjectsForTutorRoute,
  ListTutorsForSubjectRoute,
  RemoveSubjectFromTutorRoute
} from './tutor-subjects.routes'

type HandlerContext = Context<AppBindings>

function buildDuplicateTutorSubjectError() {
  return buildErrorResponse(ZOD_ERROR_MESSAGES.TUTOR_SUBJECT_EXISTS, {
    name: 'ZodError',
    issues: [
      {
        code: ZOD_ERROR_CODES.DUPLICATE_KEY,
        path: ['subjectId'],
        message: ZOD_ERROR_MESSAGES.TUTOR_SUBJECT_EXISTS
      }
    ]
  })
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
    if (currentUser.isActive === true) {
      return currentUser
    }
    forbid()
  }

  if (currentUser.role === 'tutor' && currentUser.id === tutorId) {
    if (currentUser.isActive === true) {
      return currentUser
    }
    forbid()
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
  const query = c.req.valid('query')
  const tutor = await ensureTutorExists(tutorId)

  if (!tutor) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const conditions = [eq(tutorSubjects.tutorId, tutorId)]
  if (query.q) {
    const q = `%${query.q}%`
    const search = or(
      ilike(subjects.name, q),
      ilike(subjects.canonicalName, q)
    )
    if (search) {
      conditions.push(search)
    }
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
    .where(and(...conditions))
    .orderBy(
      query.sortBy === 'canonicalName'
        ? (query.sortDir === 'desc' ? desc(subjects.canonicalName) : asc(subjects.canonicalName))
        : (query.sortDir === 'desc' ? desc(subjects.name) : asc(subjects.name))
    )
    .limit(query.limit)
    .offset(query.offset)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(tutorSubjects)
    .innerJoin(subjects, eq(tutorSubjects.subjectId, subjects.id))
    .where(and(...conditions))

  return c.json(
    buildPagedResponse(rows, Number(total), query.limit, query.offset),
    HttpStatusCodes.OK
  )
}

export const listTutorsForSubject: AppRouteHandler<ListTutorsForSubjectRoute> = async (c) => {
  const { subjectId } = c.req.valid('param')
  const query = c.req.valid('query')
  const subject = await db.query.subjects.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, subjectId)
    },
    columns: { id: true }
  })

  if (!subject) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  const conditions = [eq(tutorSubjects.subjectId, subjectId)]
  if (query.q) {
    const q = `%${query.q}%`
    const search = or(
      ilike(users.email, q),
      ilike(users.firstName, q),
      ilike(users.lastName, q)
    )
    if (search) {
      conditions.push(search)
    }
  }
  if (query.sectionId) {
    conditions.push(eq(tutorProfiles.sectionId, query.sectionId))
  }
  if (query.year !== undefined) {
    conditions.push(eq(tutorProfiles.year, query.year))
  }
  if (query.isActive !== undefined) {
    conditions.push(eq(tutorProfiles.isActive, query.isActive))
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
      updatedAt: users.updatedAt,
      sectionId: tutorProfiles.sectionId,
      year: tutorProfiles.year,
      isActive: tutorProfiles.isActive
    })
    .from(tutorSubjects)
    .innerJoin(users, eq(tutorSubjects.tutorId, users.id))
    .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .where(and(...conditions))
    .orderBy((() => {
      switch (query.sortBy) {
        case 'firstName':
          return query.sortDir === 'desc' ? desc(users.firstName) : asc(users.firstName)
        case 'email':
          return query.sortDir === 'desc' ? desc(users.email) : asc(users.email)
        case 'year':
          return query.sortDir === 'desc' ? desc(tutorProfiles.year) : asc(tutorProfiles.year)
        case 'sectionId':
          return query.sortDir === 'desc' ? desc(tutorProfiles.sectionId) : asc(tutorProfiles.sectionId)
        default:
          return query.sortDir === 'desc' ? desc(users.lastName) : asc(users.lastName)
      }
    })())
    .limit(query.limit)
    .offset(query.offset)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(tutorSubjects)
    .innerJoin(users, eq(tutorSubjects.tutorId, users.id))
    .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .where(and(...conditions))

  return c.json(
    buildPagedResponse(rows, Number(total), query.limit, query.offset),
    HttpStatusCodes.OK
  )
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
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
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
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  await db.delete(tutorSubjects)
    .where(and(eq(tutorSubjects.tutorId, tutorId), eq(tutorSubjects.subjectId, subjectId)))

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
