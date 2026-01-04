// Purpose: Subjects route handlers.
import type { Context } from 'hono'

import { LibsqlError } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { subjects } from '@/db/schemas/subjects.schema'
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type { CreateRoute, GetOneRoute, ListRoute, PatchRoute, RemoveRoute } from './subjects.routes'

type HandlerContext = Context<AppBindings>

function buildDuplicateCanonicalNameError() {
  return {
    success: false,
    error: {
      issues: [
        {
          code: ZOD_ERROR_CODES.DUPLICATE_KEY,
          path: ['canonicalName'],
          message: ZOD_ERROR_MESSAGES.CANONICAL_NAME_EXISTS
        }
      ],
      name: 'ZodError'
    }
  }
}

function isUniqueConstraintError(error: unknown): error is LibsqlError {
  return error instanceof LibsqlError && error.code.startsWith('SQLITE_CONSTRAINT')
}

function forbid(): never {
  throw new HTTPException(HttpStatusCodes.FORBIDDEN, {
    message: HttpStatusPhrases.FORBIDDEN
  })
}

// Enforce admin-only access for subject mutations.
function ensureAdmin(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin') {
    forbid()
  }

  return currentUser
}

export const list: AppRouteHandler<ListRoute> = async (c) => {
  const subjectsList = await db.query.subjects.findMany()
  return c.json(subjectsList, HttpStatusCodes.OK)
}

export const create: AppRouteHandler<CreateRoute> = async (c) => {
  ensureAdmin(c)

  const payload = c.req.valid('json')

  const existing = await db.query.subjects.findFirst({
    where(fields, operators) {
      return operators.eq(fields.canonicalName, payload.canonicalName)
    },
    columns: { id: true }
  })

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
    return c.json(
      {
        message: HttpStatusPhrases.NOT_FOUND
      },
      HttpStatusCodes.NOT_FOUND
    )
  }

  return c.json(subject, HttpStatusCodes.OK)
}

export const patch: AppRouteHandler<PatchRoute> = async (c) => {
  ensureAdmin(c)

  const { id } = c.req.valid('param')
  const updates = c.req.valid('json')

  if (typeof updates.canonicalName === 'string') {
    const existing = await db.query.subjects.findFirst({
      where(fields, operators) {
        return operators.eq(fields.canonicalName, updates.canonicalName)
      },
      columns: { id: true }
    })

    if (existing && existing.id !== id) {
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
    return c.json(
      {
        message: HttpStatusPhrases.NOT_FOUND
      },
      HttpStatusCodes.NOT_FOUND
    )
  }

  return c.json(subject, HttpStatusCodes.OK)
}

export const remove: AppRouteHandler<RemoveRoute> = async (c) => {
  ensureAdmin(c)

  const { id } = c.req.valid('param')
  const result = await db.delete(subjects)
    .where(eq(subjects.id, id))

  if (result.rowsAffected === 0) {
    return c.json(
      {
        message: HttpStatusPhrases.NOT_FOUND
      },
      HttpStatusCodes.NOT_FOUND
    )
  }

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
