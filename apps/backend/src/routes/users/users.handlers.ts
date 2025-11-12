import type { Context } from 'hono'

import { LibsqlError } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { users } from '@/db/schemas/users.schema'
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { hashPassword } from '@/lib/password'
import { revokeUserRefreshTokens } from '@/lib/refresh-tokens'

import type { CreateRoute, GetOneRoute, ListRoute, PatchRoute, RemoveRoute } from './users.routes'

type HandlerContext = Context<AppBindings>

function buildDuplicateEmailError() {
  return {
    success: false,
    error: {
      issues: [
        {
          code: ZOD_ERROR_CODES.DUPLICATE_KEY,
          path: ['email'],
          message: ZOD_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS
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

function ensureAdmin(c: HandlerContext) {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin') {
    forbid()
  }

  return currentUser
}

function ensureSelfOrAdmin(c: HandlerContext, userId: string) {
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }

  if (currentUser.role === 'admin' || currentUser.id === userId) {
    return currentUser
  }

  forbid()
}

export const list: AppRouteHandler<ListRoute> = async (c) => {
  ensureAdmin(c)

  const users = await db.query.users.findMany({
    columns: {
      passwordHash: false
    }
  })
  return c.json(users, HttpStatusCodes.OK)
}

export const create: AppRouteHandler<CreateRoute> = async (c) => {
  ensureAdmin(c)

  const user = c.req.valid('json')
  const passwordHash = await hashPassword(user.password)

  const existing = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, user.email)
    },
    columns: { id: true }
  })

  if (existing) {
    return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
  }

  try {
    // insert with server-generated hash
    const [inserted] = await db
      .insert(users)
      .values({
        ...user,
        passwordHash
      })
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt
      })

    const location = `/users/${inserted.id}`
    c.header('Location', location)

    return c.json(inserted, HttpStatusCodes.CREATED)
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
    }
    throw error
  }
}

export const getOne: AppRouteHandler<GetOneRoute> = async (c) => {
  const { id } = c.req.valid('param')
  ensureSelfOrAdmin(c, id)

  const user = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, id)
    },
    columns: {
      passwordHash: false
    }
  })

  if (!user) {
    return c.json(
      {
        message: HttpStatusPhrases.NOT_FOUND
      },
      HttpStatusCodes.NOT_FOUND
    )
  }

  return c.json(user, HttpStatusCodes.OK)
}

export const patch: AppRouteHandler<PatchRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const updates = c.req.valid('json')
  ensureSelfOrAdmin(c, id)

  const values = { ...updates }
  let passwordChanged = false
  if (updates.password) {
    values.passwordHash = await hashPassword(updates.password)
    delete values.password
    passwordChanged = true
  }

  if (typeof updates.email === 'string') {
    const existing = await db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.email, updates.email)
      },
      columns: { id: true }
    })

    if (existing && existing.id !== id) {
      return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
    }
  }

  let user
  try {
    const [updated] = await db
      .update(users)
      .set(values)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt
      })
    user = updated
  }
  catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
    }
    throw error
  }

  if (!user) {
    return c.json(
      {
        message: HttpStatusPhrases.NOT_FOUND
      },
      HttpStatusCodes.NOT_FOUND
    )
  }

  if (passwordChanged) {
    await revokeUserRefreshTokens(id)
  }

  return c.json(user, HttpStatusCodes.OK)
}

export const remove: AppRouteHandler<RemoveRoute> = async (c) => {
  ensureAdmin(c)

  const { id } = c.req.valid('param')
  const result = await db.delete(users)
    .where(eq(users.id, id))

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
