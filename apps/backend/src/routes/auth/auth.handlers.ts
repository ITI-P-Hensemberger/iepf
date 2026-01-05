// Purpose: Auth route handlers.
import type { Context } from 'hono'

import { eq } from 'drizzle-orm'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { users } from '@/db/schemas/users.schema'
import { createAccessToken } from '@/lib/auth'
import { DEFAULT_TUTOR_SETTINGS, ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { consumeEmailVerificationToken, issueEmailVerificationToken } from '@/lib/email-verification'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { hashPassword, verifyPassword } from '@/lib/password'
import { consumePasswordResetToken, issuePasswordResetToken } from '@/lib/password-reset'
import { issueRefreshToken, revokeRefreshToken, revokeUserRefreshTokens, rotateRefreshToken } from '@/lib/refresh-tokens'

import type {
  ConfirmEmailVerificationRoute,
  ConfirmPasswordResetRoute,
  LoginRoute,
  LogoutRoute,
  RefreshRoute,
  RegisterRoute,
  RequestEmailVerificationRoute,
  RequestPasswordResetRoute
} from './auth.routes'

function unauthorized(c: Context<AppBindings>) {
  return c.json(
    { message: HttpStatusPhrases.UNAUTHORIZED },
    HttpStatusCodes.UNAUTHORIZED
  )
}

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

export const login: AppRouteHandler<LoginRoute> = async (c) => {
  const credentials = c.req.valid('json')
  const user = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, credentials.email)
    },
    columns: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      emailVerifiedAt: true
    }
  })

  if (!user) {
    return unauthorized(c)
  }

  const isValid = await verifyPassword(user.passwordHash, credentials.password)

  if (!isValid) {
    return unauthorized(c)
  }

  if (!user.emailVerifiedAt) {
    return c.json(
      { message: 'Email not verified' },
      HttpStatusCodes.FORBIDDEN
    )
  }

  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken({
      id: user.id,
      email: user.email,
      role: user.role
    }),
    issueRefreshToken(user.id)
  ])

  return c.json(
    {
      accessToken: accessToken.token,
      tokenType: 'Bearer' as const,
      expiresIn: accessToken.expiresIn,
      refreshToken: refreshToken.token,
      refreshTokenExpiresIn: refreshToken.expiresIn
    },
    HttpStatusCodes.OK
  )
}

export const refreshTokensHandler: AppRouteHandler<RefreshRoute> = async (c) => {
  const payload = c.req.valid('json')
  const rotation = await rotateRefreshToken(payload.refreshToken)

  if (!rotation) {
    return unauthorized(c)
  }

  if (!rotation.user.emailVerifiedAt) {
    return unauthorized(c)
  }

  const accessToken = await createAccessToken({
    id: rotation.user.id,
    email: rotation.user.email,
    role: rotation.user.role
  })

  return c.json(
    {
      accessToken: accessToken.token,
      tokenType: 'Bearer' as const,
      expiresIn: accessToken.expiresIn,
      refreshToken: rotation.refresh.token,
      refreshTokenExpiresIn: rotation.refresh.expiresIn
    },
    HttpStatusCodes.OK
  )
}

export const logout: AppRouteHandler<LogoutRoute> = async (c) => {
  const payload = c.req.valid('json')
  await revokeRefreshToken(payload.refreshToken)
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

export const register: AppRouteHandler<RegisterRoute> = async (c) => {
  const payload = c.req.valid('json')
  // Student registration accepts optional parent contact fields.
  const { password, ...userData } = payload
  const passwordHash = await hashPassword(password)

  const existing = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, payload.email)
    },
    columns: { id: true }
  })

  if (existing) {
    return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
  }

  const [inserted] = await db
    .insert(users)
    .values({
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      passwordHash,
      role: 'student'
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

  await db.insert(studentProfiles).values({
    userId: inserted.id,
    parentFirstName: userData.parentFirstName,
    parentLastName: userData.parentLastName,
    parentEmail: userData.parentEmail
  })

  const verification = await issueEmailVerificationToken(inserted.id)
  // eslint-disable-next-line no-console
  console.log(`Email verification token for ${inserted.email}: ${verification.token}`)

  c.header('Location', `/users/${inserted.id}`)
  return c.json(
    {
      ...inserted,
      parentFirstName: userData.parentFirstName ?? null,
      parentLastName: userData.parentLastName ?? null,
      parentEmail: userData.parentEmail ?? null
    },
    HttpStatusCodes.CREATED
  )
}

export const requestPasswordReset: AppRouteHandler<RequestPasswordResetRoute> = async (c) => {
  const payload = c.req.valid('json')
  const user = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, payload.email)
    },
    columns: {
      id: true,
      email: true
    }
  })

  if (user) {
    const reset = await issuePasswordResetToken(user.id)
    // eslint-disable-next-line no-console
    console.log(`Password reset token for ${user.email}: ${reset.token}`)
  }

  return c.json(
    { message: 'If the account exists, a reset email has been sent.' },
    HttpStatusCodes.OK
  )
}

export const confirmPasswordReset: AppRouteHandler<ConfirmPasswordResetRoute> = async (c) => {
  const payload = c.req.valid('json')
  const user = await consumePasswordResetToken(payload.token)

  if (!user) {
    return unauthorized(c)
  }

  const passwordHash = await hashPassword(payload.password)

  await db.update(users)
    .set({ passwordHash })
    .where(eq(users.id, user.id))

  await revokeUserRefreshTokens(user.id)

  return c.json(
    { message: 'Password reset successfully.' },
    HttpStatusCodes.OK
  )
}

export const requestEmailVerification: AppRouteHandler<RequestEmailVerificationRoute> = async (c) => {
  const payload = c.req.valid('json')
  const user = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, payload.email)
    },
    columns: {
      id: true,
      email: true,
      emailVerifiedAt: true
    }
  })

  if (user && !user.emailVerifiedAt) {
    const verification = await issueEmailVerificationToken(user.id)
    // eslint-disable-next-line no-console
    console.log(`Email verification token for ${user.email}: ${verification.token}`)
  }

  return c.json(
    { message: 'If the account exists, a verification email has been sent.' },
    HttpStatusCodes.OK
  )
}

export const confirmEmailVerification: AppRouteHandler<ConfirmEmailVerificationRoute> = async (c) => {
  const payload = c.req.valid('json')
  const user = await consumeEmailVerificationToken(payload.token)

  if (!user) {
    return unauthorized(c)
  }

  if (!user.emailVerifiedAt) {
    await db.update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, user.id))
  }

  const roleRecord = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, user.id)
    },
    columns: { role: true }
  })

  if (roleRecord?.role === 'tutor') {
    const existing = await db.query.tutorSettings.findFirst({
      where(fields, operators) {
        return operators.eq(fields.tutorId, user.id)
      },
      columns: { id: true }
    })

    if (!existing) {
      await db.insert(tutorSettings).values({
        tutorId: user.id,
        ...DEFAULT_TUTOR_SETTINGS
      })
    }
  }

  return c.json(
    { message: 'Email verified.' },
    HttpStatusCodes.OK
  )
}
