// Purpose: Subjects route handlers.
import type { Context } from 'hono'

import { and, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { subjects } from '@/db/schemas/subjects.schema'
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { isUniqueConstraintError } from '@/lib/db-errors'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { buildPagedResponse } from '@/lib/pagination'
import { canonicalSubjectName } from '@/lib/subject-name'

import type { CreateRoute, GetOneRoute, ListRoute, PatchRoute, RemoveRoute } from './subjects.routes'

type HandlerContext = Context<AppBindings>

function buildDuplicateCanonicalNameError() {
  return buildErrorResponse(ZOD_ERROR_MESSAGES.CANONICAL_NAME_EXISTS, {
    name: 'ZodError',
    issues: [
      {
        code: ZOD_ERROR_CODES.DUPLICATE_KEY,
        path: ['name'],
        message: ZOD_ERROR_MESSAGES.CANONICAL_NAME_EXISTS
      }
    ]
  })
}

// Another subject with the same canonical name or the same name, letter case aside.
async function sameSubject(canonicalName: string, name: string, exceptId?: string) {
  const [row] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(
      or(eq(subjects.canonicalName, canonicalName), sql`lower(${subjects.name}) = lower(${name.trim()})`),
      exceptId ? ne(subjects.id, exceptId) : undefined
    ))
    .limit(1)
  return row ?? null
}

function forbid(): never {
  throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
    message: HttpStatusPhrases.FORBIDDEN
  })
}

// Enforce admin-only access for subject mutations.
function ensureAdmin(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    forbid()
  }

  return currentUser
}

export const list: AppRouteHandler<ListRoute> = async (c) => {
  const query = c.req.valid('query')

  const conditions = []
  if (query.q) {
    const q = `%${query.q}%`
    conditions.push(or(
      ilike(subjects.name, q),
      ilike(subjects.canonicalName, q)
    ))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const subjectsList = await db.query.subjects.findMany({
    where: whereClause,
    orderBy(fields, operators) {
      return operators.asc(fields.name)
    },
    limit: query.limit,
    offset: query.offset
  })

  const totalQuery = db
    .select({ total: sql<number>`count(*)` })
    .from(subjects)

  if (whereClause) {
    totalQuery.where(whereClause)
  }

  const [{ total }] = await totalQuery

  return c.json(
    buildPagedResponse(subjectsList, Number(total), query.limit, query.offset),
    HttpStatusCodes.OK
  )
}

export const create: AppRouteHandler<CreateRoute> = async (c) => {
  ensureAdmin(c)

  const { name } = c.req.valid('json')
  const payload = { name, canonicalName: canonicalSubjectName(name) }

  const existing = await sameSubject(payload.canonicalName, name)

  if (existing) {
    return c.json(buildDuplicateCanonicalNameError(), HttpStatusCodes.CONFLICT)
  }

  try {
    const [inserted] = await db
      .insert(subjects)
      .values(payload)
      .returning({
        id: subjects.id,
        name: subjects.name,
        canonicalName: subjects.canonicalName,
        createdAt: subjects.createdAt,
        updatedAt: subjects.updatedAt
      })

    const location = `/subjects/${inserted.id}`
    c.header('Location', location)

    return c.json(inserted, HttpStatusCodes.CREATED)
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json(buildDuplicateCanonicalNameError(), HttpStatusCodes.CONFLICT)
    }
    throw error
  }
}

export const getOne: AppRouteHandler<GetOneRoute> = async (c) => {
  const { id } = c.req.valid('param')

  const subject = await db.query.subjects.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, id)
    }
  })

  if (!subject) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  return c.json(subject, HttpStatusCodes.OK)
}

export const patch: AppRouteHandler<PatchRoute> = async (c) => {
  ensureAdmin(c)

  const { id } = c.req.valid('param')
  const { name } = c.req.valid('json')
  // Renaming makes the canonical name again from the new name.
  const updates = name ? { name, canonicalName: canonicalSubjectName(name) } : {}

  if (updates.canonicalName) {
    const existing = await sameSubject(updates.canonicalName, updates.name, id)
    if (existing) {
      return c.json(buildDuplicateCanonicalNameError(), HttpStatusCodes.CONFLICT)
    }
  }

  let subject
  try {
    const [updated] = await db
      .update(subjects)
      .set(updates)
      .where(eq(subjects.id, id))
      .returning({
        id: subjects.id,
        name: subjects.name,
        canonicalName: subjects.canonicalName,
        createdAt: subjects.createdAt,
        updatedAt: subjects.updatedAt
      })
    subject = updated
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json(buildDuplicateCanonicalNameError(), HttpStatusCodes.CONFLICT)
    }
    throw error
  }

  if (!subject) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  return c.json(subject, HttpStatusCodes.OK)
}

export const remove: AppRouteHandler<RemoveRoute> = async (c) => {
  ensureAdmin(c)

  const { id } = c.req.valid('param')
  const result = await db.delete(subjects)
    .where(eq(subjects.id, id))

  if (result.rowCount === 0) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
