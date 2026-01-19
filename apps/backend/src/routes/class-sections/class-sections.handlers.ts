// Purpose: Class sections route handlers.
import type { Context } from 'hono'

import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { classSections } from '@/db/schemas/class-sections.schema'
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'

import type { CreateRoute, GetOneRoute, ListRoute, PatchRoute, RemoveRoute } from './class-sections.routes'

type HandlerContext = Context<AppBindings>

function buildDuplicateNameError() {
  return {
    success: false,
    error: {
      issues: [
        {
          code: ZOD_ERROR_CODES.DUPLICATE_KEY,
          path: ['name'],
          message: ZOD_ERROR_MESSAGES.CLASS_SECTION_EXISTS
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

function ensureAdmin(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    forbid()
  }

  return currentUser
}

export const list: AppRouteHandler<ListRoute> = async (c) => {
  const sections = await db.query.classSections.findMany()
  return c.json(sections, HttpStatusCodes.OK)
}

export const create: AppRouteHandler<CreateRoute> = async (c) => {
  ensureAdmin(c)
  const payload = c.req.valid('json')

  const existing = await db.query.classSections.findFirst({
    where(fields, operators) {
      return operators.eq(fields.name, payload.name)
    },
    columns: { id: true }
  })

  if (existing) {
    return c.json(buildDuplicateNameError(), HttpStatusCodes.CONFLICT)
  }

  try {
    const [inserted] = await db.insert(classSections)
      .values(payload)
      .returning({
        id: classSections.id,
        name: classSections.name,
        createdAt: classSections.createdAt,
        updatedAt: classSections.updatedAt
      })

    const location = `/class-sections/${inserted.id}`
    c.header('Location', location)

    return c.json(inserted, HttpStatusCodes.CREATED)
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json(buildDuplicateNameError(), HttpStatusCodes.CONFLICT)
    }
    throw error
  }
}

export const getOne: AppRouteHandler<GetOneRoute> = async (c) => {
  ensureAdmin(c)
  const { id } = c.req.valid('param')

  const section = await db.query.classSections.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, id)
    }
  })

  if (!section) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  return c.json(section, HttpStatusCodes.OK)
}

export const patch: AppRouteHandler<PatchRoute> = async (c) => {
  ensureAdmin(c)
  const { id } = c.req.valid('param')
  const payload = c.req.valid('json')

  const existing = await db.query.classSections.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, id)
    },
    columns: { id: true }
  })

  if (!existing) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  try {
    const [updated] = await db.update(classSections)
      .set(payload)
      .where(eq(classSections.id, id))
      .returning({
        id: classSections.id,
        name: classSections.name,
        createdAt: classSections.createdAt,
        updatedAt: classSections.updatedAt
      })

    return c.json(updated, HttpStatusCodes.OK)
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json(buildDuplicateNameError(), HttpStatusCodes.CONFLICT)
    }
    throw error
  }
}

export const remove: AppRouteHandler<RemoveRoute> = async (c) => {
  ensureAdmin(c)
  const { id } = c.req.valid('param')

  const existing = await db.query.classSections.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, id)
    },
    columns: { id: true }
  })

  if (!existing) {
    return c.json({ message: HttpStatusPhrases.NOT_FOUND }, HttpStatusCodes.NOT_FOUND)
  }

  await db.delete(classSections)
    .where(eq(classSections.id, id))

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
