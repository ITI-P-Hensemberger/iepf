// Purpose: Users route handlers.
import type { Context } from 'hono'

import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import {
  buildActivationChangedMessage,
  buildProfileUpdatedMessage,
  buildTutorCreatedMessage
} from '@/lib/email-templates'
import { issueEmailVerificationToken } from '@/lib/email-verification'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { sendMail } from '@/lib/mailer'
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

function extractProfileUpdates(updates: Record<string, unknown>) {
  return {
    sectionId: updates.sectionId as string | undefined,
    year: updates.year as number | undefined,
    isActive: updates.isActive as boolean | undefined
  }
}

async function attachProfiles(records: UserPublicRecord[]) {
  const studentIds = records.filter(user => user.role === 'student').map(user => user.id)
  const tutorIds = records.filter(user => user.role === 'tutor').map(user => user.id)

  let studentProfilesList: Array<{
    userId: string
    sectionId: string | null
    year: number | null
    isActive: boolean | null
  }> = []
  if (studentIds.length > 0) {
    studentProfilesList = await db.query.studentProfiles.findMany({
      where(fields, operators) {
        return operators.inArray(fields.userId, studentIds)
      },
      columns: {
        userId: true,
        sectionId: true,
        year: true,
        isActive: true
      }
    })
  }

  let tutorProfilesList: Array<{
    userId: string
    sectionId: string | null
    year: number | null
  }> = []
  if (tutorIds.length > 0) {
    tutorProfilesList = await db.query.tutorProfiles.findMany({
      where(fields, operators) {
        return operators.inArray(fields.userId, tutorIds)
      },
      columns: {
        userId: true,
        sectionId: true,
        year: true
      }
    })
  }

  const studentProfileMap = new Map(studentProfilesList.map(profile => [profile.userId, profile]))
  const tutorProfileMap = new Map(tutorProfilesList.map(profile => [profile.userId, profile]))

  return records.map((user) => {
    if (user.role === 'student') {
      const profile = studentProfileMap.get(user.id)
      return {
        ...user,
        sectionId: profile?.sectionId ?? null,
        year: profile?.year ?? null,
        isActive: profile?.isActive ?? false
      }
    }

    if (user.role === 'tutor') {
      const profile = tutorProfileMap.get(user.id)
      return {
        ...user,
        sectionId: profile?.sectionId ?? null,
        year: profile?.year ?? null,
        isActive: null
      }
    }

    return {
      ...user,
      sectionId: null,
      year: null,
      isActive: null
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
  const withProfiles = await attachProfiles(records)
  return c.json(withProfiles, HttpStatusCodes.OK)
}

export const create: AppRouteHandler<CreateRoute> = async (c) => {
  ensureAdmin(c)

  const user = c.req.valid('json')
  const profileUpdates = extractProfileUpdates(user)
  const studentProfileUpdates = {
    sectionId: profileUpdates.sectionId,
    year: profileUpdates.year,
    isActive: profileUpdates.isActive
  }
  const tutorProfileUpdates = {
    sectionId: profileUpdates.sectionId,
    year: profileUpdates.year
  }
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

  if (user.role === 'student' && profileUpdates.year !== undefined
    && (profileUpdates.year < 1 || profileUpdates.year > 3)) {
    return c.json(
      {
        success: false,
        error: {
          issues: [
            {
              code: ZOD_ERROR_CODES.INVALID_UPDATES,
              path: ['year'],
              message: 'L\'anno deve essere compreso tra 1 e 3'
            }
          ],
          name: 'ZodError'
        }
      },
      HttpStatusCodes.UNPROCESSABLE_ENTITY
    )
  }

  if (user.role === 'tutor' && profileUpdates.year !== undefined
    && (profileUpdates.year < 4 || profileUpdates.year > 5)) {
    return c.json(
      {
        success: false,
        error: {
          issues: [
            {
              code: ZOD_ERROR_CODES.INVALID_UPDATES,
              path: ['year'],
              message: 'L\'anno deve essere compreso tra 4 e 5'
            }
          ],
          name: 'ZodError'
        }
      },
      HttpStatusCodes.UNPROCESSABLE_ENTITY
    )
  }

  if (profileUpdates.sectionId) {
    const section = await db.query.classSections.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, profileUpdates.sectionId as string)
      },
      columns: { id: true }
    })
    if (!section) {
      return c.json({ message: HttpStatusPhrases.BAD_REQUEST }, HttpStatusCodes.BAD_REQUEST)
    }
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
        sectionId: studentProfileUpdates.sectionId,
        year: studentProfileUpdates.year,
        isActive: studentProfileUpdates.isActive ?? false
      })
    }

    if (inserted.role === 'tutor') {
      await db.insert(tutorProfiles).values({
        userId: inserted.id,
        sectionId: tutorProfileUpdates.sectionId,
        year: tutorProfileUpdates.year
      })

      const verification = await issueEmailVerificationToken(inserted.id)
      const tutorEmail = buildTutorCreatedMessage(verification.token)
      await sendMail({
        to: inserted.email,
        subject: tutorEmail.subject,
        text: tutorEmail.text,
        html: tutorEmail.html
      })
    }

    const location = `/users/${inserted.id}`
    c.header('Location', location)

    const [withProfile] = await attachProfiles([inserted])
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

  const [withProfile] = await attachProfiles([user])
  return c.json(withProfile, HttpStatusCodes.OK)
}

export const patch: AppRouteHandler<PatchRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const updates = c.req.valid('json') as {
    email?: string
    firstName?: string
    lastName?: string
    password?: string
    sectionId?: string
    year?: number
    isActive?: boolean
  }
  ensureSelfOrAdmin(c, id)
  const currentUser = c.get('currentUser')

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
  const profileUpdates = extractProfileUpdates(updates)
  const studentProfileUpdates = {
    sectionId: profileUpdates.sectionId,
    year: profileUpdates.year,
    isActive: profileUpdates.isActive
  }
  const tutorProfileUpdates = {
    sectionId: profileUpdates.sectionId,
    year: profileUpdates.year
  }
  let passwordChanged = false
  let previousIsActive: boolean | null | undefined
  const hasProfileUpdates = Object.values(profileUpdates).some(value => value !== undefined)
  if (updates.password) {
    userUpdates.passwordHash = await hashPassword(updates.password)
    passwordChanged = true
  }
  const hasUserUpdates = Object.values(userUpdates).some(value => value !== undefined)

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

    if (hasProfileUpdates && currentUser?.role !== 'admin') {
      return c.json({ message: HttpStatusPhrases.FORBIDDEN }, HttpStatusCodes.FORBIDDEN)
    }

    if (hasProfileUpdates && existing.role === 'admin') {
      return c.json(
        {
          success: false,
          error: {
            issues: [
              {
                code: ZOD_ERROR_CODES.INVALID_UPDATES,
                path: ['role'],
                message: 'Sezioni e anno sono consentiti solo per studenti e tutor'
              }
            ],
            name: 'ZodError'
          }
        },
        HttpStatusCodes.UNPROCESSABLE_ENTITY
      )
    }

    if (profileUpdates.isActive !== undefined && existing.role !== 'student') {
      return c.json(
        {
          success: false,
          error: {
            issues: [
              {
                code: ZOD_ERROR_CODES.INVALID_UPDATES,
                path: ['isActive'],
                message: 'L\'attivazione e consentita solo per studenti'
              }
            ],
            name: 'ZodError'
          }
        },
        HttpStatusCodes.UNPROCESSABLE_ENTITY
      )
    }
    if (existing.role === 'student' && profileUpdates.isActive !== undefined) {
      const currentProfile = await db.query.studentProfiles.findFirst({
        where(fields, operators) {
          return operators.eq(fields.userId, id)
        },
        columns: { isActive: true }
      })
      previousIsActive = currentProfile?.isActive ?? null
    }

    if (hasProfileUpdates && existing.role === 'student') {
      if (profileUpdates.year !== undefined && (profileUpdates.year < 1 || profileUpdates.year > 3)) {
        return c.json(
          {
            success: false,
            error: {
              issues: [
                {
                  code: ZOD_ERROR_CODES.INVALID_UPDATES,
                  path: ['year'],
                  message: 'L\'anno deve essere compreso tra 1 e 3'
                }
              ],
              name: 'ZodError'
            }
          },
          HttpStatusCodes.UNPROCESSABLE_ENTITY
        )
      }
    }

    if (hasProfileUpdates && existing.role === 'tutor') {
      if (profileUpdates.year !== undefined && (profileUpdates.year < 4 || profileUpdates.year > 5)) {
        return c.json(
          {
            success: false,
            error: {
              issues: [
                {
                  code: ZOD_ERROR_CODES.INVALID_UPDATES,
                  path: ['year'],
                  message: 'L\'anno deve essere compreso tra 4 e 5'
                }
              ],
              name: 'ZodError'
            }
          },
          HttpStatusCodes.UNPROCESSABLE_ENTITY
        )
      }
    }

    if (profileUpdates.sectionId) {
      const section = await db.query.classSections.findFirst({
        where(fields, operators) {
          return operators.eq(fields.id, profileUpdates.sectionId as string)
        },
        columns: { id: true }
      })
      if (!section) {
        return c.json({ message: HttpStatusPhrases.BAD_REQUEST }, HttpStatusCodes.BAD_REQUEST)
      }
    }

    if (hasUserUpdates) {
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
    }
    else {
      user = await db.query.users.findFirst({
        where(fields, operators) {
          return operators.eq(fields.id, id)
        },
        columns: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          emailVerifiedAt: true,
          createdAt: true,
          updatedAt: true
        }
      })
    }

    if (existing.role === 'student' && hasProfileUpdates) {
      const result = await db.update(studentProfiles)
        .set(studentProfileUpdates)
        .where(eq(studentProfiles.userId, id))
      if (result.rowCount === 0) {
        await db.insert(studentProfiles).values({
          userId: id,
          ...studentProfileUpdates
        })
      }
    }

    if (existing.role === 'tutor' && hasProfileUpdates) {
      const result = await db.update(tutorProfiles)
        .set(tutorProfileUpdates)
        .where(eq(tutorProfiles.userId, id))
      if (result.rowCount === 0) {
        await db.insert(tutorProfiles).values({
          userId: id,
          ...tutorProfileUpdates
        })
      }
    }

    if (user?.email && (hasUserUpdates || hasProfileUpdates)) {
      const activationChanged = previousIsActive !== undefined
        && profileUpdates.isActive !== undefined
        && previousIsActive !== profileUpdates.isActive
      const message = activationChanged
        ? buildActivationChangedMessage(Boolean(profileUpdates.isActive))
        : buildProfileUpdatedMessage()
      try {
        await sendMail({
          to: user.email,
          subject: message.subject,
          text: message.text,
          html: message.html
        })
      }
      catch (error) {
        // Avoid blocking profile updates on email delivery issues.
        console.error('Failed to send profile update email', error)
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

  const [withProfile] = await attachProfiles([user])
  return c.json(withProfile, HttpStatusCodes.OK)
}

export const remove: AppRouteHandler<RemoveRoute> = async (c) => {
  ensureAdmin(c)

  const { id } = c.req.valid('param')
  const result = await db.delete(users)
    .where(eq(users.id, id))

  if (result.rowCount === 0) {
    return c.json(
      {
        message: HttpStatusPhrases.NOT_FOUND
      },
      HttpStatusCodes.NOT_FOUND
    )
  }

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
