// Purpose: Users route handlers.
import type { Context } from 'hono'

import { LibsqlError } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { hashPassword } from '@/lib/password'
import { revokeUserRefreshTokens } from '@/lib/refresh-tokens'

import type { CreateRoute, GetOneRoute, ListRoute, PatchRoute, RemoveRoute } from './users.routes'

type HandlerContext = Context<AppBindings>
type UserPublicRecord = Omit<typeof users.$inferSelect, 'passwordHash'>

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

function extractParentUpdates(updates: Record<string, unknown>) {
  return {
    parentFirstName: updates.parentFirstName as string | undefined,
    parentLastName: updates.parentLastName as string | undefined,
    parentEmail: updates.parentEmail as string | undefined
  }
}

async function attachStudentProfiles(records: UserPublicRecord[]) {
  const studentIds = records.filter(user => user.role === 'student').map(user => user.id)
  if (studentIds.length === 0) {
    return records.map(user => ({
      ...user,
      parentFirstName: null,
      parentLastName: null,
      parentEmail: null
    }))
  }

  const profiles = await db.query.studentProfiles.findMany({
    where(fields, operators) {
      return operators.inArray(fields.userId, studentIds)
    },
    columns: {
      userId: true,
      parentFirstName: true,
      parentLastName: true,
      parentEmail: true
    }
  })

  const profileMap = new Map(profiles.map(profile => [profile.userId, profile]))

  return records.map((user) => {
    const profile = profileMap.get(user.id)
    return {
      ...user,
      parentFirstName: profile?.parentFirstName ?? null,
      parentLastName: profile?.parentLastName ?? null,
      parentEmail: profile?.parentEmail ?? null
    }
  })
}

export const list: AppRouteHandler<ListRoute> = async (c) => {
  ensureAdmin(c)

  const records = await db.query.users.findMany({
    columns: {
      passwordHash: false
    }
  })
  const withProfiles = await attachStudentProfiles(records)
  return c.json(withProfiles, HttpStatusCodes.OK)
}

export const create: AppRouteHandler<CreateRoute> = async (c) => {
  ensureAdmin(c)

  const user = c.req.valid('json')
  const parentUpdates = extractParentUpdates(user)
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
    const [inserted] = await db
      .insert(users)
      .values({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        // Role is validated by the admin-only schema.
        role: user.role,
        passwordHash
      })
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt
      })

    if (inserted.role === 'student') {
      await db.insert(studentProfiles).values({
        userId: inserted.id,
        parentFirstName: parentUpdates.parentFirstName,
        parentLastName: parentUpdates.parentLastName,
        parentEmail: parentUpdates.parentEmail
      })
    }

    if (inserted.role === 'tutor') {
      await db.insert(tutorProfiles).values({
        userId: inserted.id
      })
    }

    const location = `/users/${inserted.id}`
    c.header('Location', location)

    const [withProfile] = await attachStudentProfiles([inserted])
    return c.json(withProfile, HttpStatusCodes.CREATED)
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

  const [withProfile] = await attachStudentProfiles([user])
  return c.json(withProfile, HttpStatusCodes.OK)
}

export const patch: AppRouteHandler<PatchRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const updates = c.req.valid('json') as {
    email?: string
    firstName?: string
    lastName?: string
    password?: string
    parentFirstName?: string
    parentLastName?: string
    parentEmail?: string
  }
  ensureSelfOrAdmin(c, id)

  const userUpdates: {
    email?: string
    firstName?: string
    lastName?: string
    passwordHash?: string
  } = {
    email: updates.email,
    firstName: updates.firstName,
    lastName: updates.lastName
  }
  const parentUpdates = extractParentUpdates(updates)
  let passwordChanged = false
  if (updates.password) {
    userUpdates.passwordHash = await hashPassword(updates.password)
    passwordChanged = true
  }

  if (typeof updates.email === 'string') {
    const email = updates.email
    const existing = await db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.email, email)
      },
      columns: { id: true }
    })

    if (existing && existing.id !== id) {
      return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
    }
  }

  let user
  try {
    const existing = await db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, id)
      },
      columns: {
        id: true,
        role: true
      }
    })

    if (!existing) {
      return c.json(
        {
          message: HttpStatusPhrases.NOT_FOUND
        },
        HttpStatusCodes.NOT_FOUND
      )
    }

    const hasParentUpdates = Object.values(parentUpdates).some(value => value !== undefined)
    if (hasParentUpdates && existing.role !== 'student') {
      return c.json(
        {
          success: false,
          error: {
            issues: [
              {
                code: ZOD_ERROR_CODES.INVALID_UPDATES,
                path: ['role'],
                message: 'Parent information is only allowed for students'
              }
            ],
            name: 'ZodError'
          }
        },
        HttpStatusCodes.UNPROCESSABLE_ENTITY
      )
    }

    const [updated] = await db
      .update(users)
      .set({
        email: userUpdates.email,
        firstName: userUpdates.firstName,
        lastName: userUpdates.lastName,
        passwordHash: userUpdates.passwordHash
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt
      })
    user = updated

    if (existing.role === 'student' && hasParentUpdates) {
      const result = await db.update(studentProfiles)
        .set(parentUpdates)
        .where(eq(studentProfiles.userId, id))
      if (result.rowsAffected === 0) {
        await db.insert(studentProfiles).values({
          userId: id,
          ...parentUpdates
        })
      }
    }
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

  const [withProfile] = await attachStudentProfiles([user])
  return c.json(withProfile, HttpStatusCodes.OK)
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
