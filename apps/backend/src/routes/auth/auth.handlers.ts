// Purpose: Auth route handlers.
import type { Context } from 'hono'

import { and, eq, gt, ilike, sql } from 'drizzle-orm'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { adminInviteTokens } from '@/db/schemas/admin-invite-tokens.schema'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tutorInviteTokens } from '@/db/schemas/tutor-invite-tokens.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { users } from '@/db/schemas/users.schema'
import { consumeAdminInviteToken, issueAdminInviteToken } from '@/lib/admin-invite'
import { createAccessToken } from '@/lib/auth'
import { DEFAULT_TUTOR_SETTINGS, ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import {
  buildAdminInviteMessage,
  buildEmailVerificationMessage,
  buildPasswordChangedMessage,
  buildPasswordResetMessage,
  buildRegistrationConfirmedMessage,
  buildStudentRegistrationMessage,
  buildTutorInviteMessage
} from '@/lib/email-templates'
import { consumeEmailVerificationToken, issueEmailVerificationToken } from '@/lib/email-verification'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { sendMail } from '@/lib/mailer'
import { buildPagedResponse } from '@/lib/pagination'
import { hashPassword, verifyPassword } from '@/lib/password'
import { consumePasswordResetToken, issuePasswordResetToken } from '@/lib/password-reset'
import { issueRefreshToken, revokeRefreshToken, revokeUserRefreshTokens, rotateRefreshToken } from '@/lib/refresh-tokens'
import { consumeTutorInviteToken, issueTutorInviteToken } from '@/lib/tutor-invite'

import type {
  ConfirmAdminInviteRoute,
  ConfirmEmailVerificationRoute,
  ConfirmPasswordResetRoute,
  ConfirmTutorInviteRoute,
  DeleteAdminInviteRoute,
  DeleteTutorInviteRoute,
  InviteAdminRoute,
  InviteTutorRoute,
  ListAdminInvitesRoute,
  ListTutorInvitesRoute,
  LoginRoute,
  LogoutRoute,
  RefreshRoute,
  RegisterRoute,
  RequestEmailVerificationRoute,
  RequestPasswordResetRoute
} from './auth.routes'

function unauthorized(c: Context<AppBindings>) {
  return c.json(buildErrorResponse(HttpStatusPhrases.UNAUTHORIZED), HttpStatusCodes.UNAUTHORIZED)
}

function buildDuplicateEmailError() {
  return buildErrorResponse(ZOD_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS, {
    name: 'ZodError',
    issues: [
      {
        code: ZOD_ERROR_CODES.DUPLICATE_KEY,
        path: ['email'],
        message: ZOD_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS
      }
    ]
  })
}

export const login: AppRouteHandler<LoginRoute> = async (c) => {
  const credentials = c.req.valid('json')
  const email = credentials.email.trim().toLowerCase()
  const user = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, email)
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
    return c.json(buildErrorResponse('Email non verificata'), HttpStatusCodes.FORBIDDEN)
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
  const email = payload.email.trim().toLowerCase()
  const { password, ...userData } = payload
  const passwordHash = await hashPassword(password)

  const existing = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, email)
    },
    columns: { id: true }
  })

  if (existing) {
    return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
  }
  if (userData.sectionId) {
    const section = await db.query.classSections.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, userData.sectionId as string)
      },
      columns: { id: true }
    })
    if (!section) {
      return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
    }
  }

  const [inserted] = await db
    .insert(users)
    .values({
      email,
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
    sectionId: userData.sectionId,
    year: userData.year,
    isActive: false
  })

  const verification = await issueEmailVerificationToken(inserted.id)
  const registrationEmail = buildStudentRegistrationMessage(verification.token)
  sendMail({
    to: inserted.email,
    subject: registrationEmail.subject,
    text: registrationEmail.text,
    html: registrationEmail.html
  }).catch(err => console.error('Failed to send email:', err))

  c.header('Location', `/users/${inserted.id}`)
  return c.json(
    {
      ...inserted,
      sectionId: userData.sectionId ?? null,
      year: userData.year ?? null,
      isActive: false
    },
    HttpStatusCodes.CREATED
  )
}

export const listTutorInvites: AppRouteHandler<ListTutorInvitesRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  const query = c.req.valid('query')
  const now = new Date()

  const conditions = []
  if (!query.includeExpired) {
    conditions.push(gt(tutorInviteTokens.expiresAt, now))
  }
  if (query.q) {
    conditions.push(ilike(tutorInviteTokens.email, `%${query.q}%`))
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db.query.tutorInviteTokens.findMany({
    where: whereClause,
    columns: {
      id: true,
      email: true,
      expiresAt: true,
      createdAt: true
    },
    orderBy(fields, operators) {
      const direction = query.sortDir === 'desc' ? operators.desc : operators.asc
      return query.sortBy === 'createdAt'
        ? direction(fields.createdAt)
        : direction(fields.expiresAt)
    },
    limit: query.limit,
    offset: query.offset
  })

  const totalQuery = db
    .select({ total: sql<number>`count(*)` })
    .from(tutorInviteTokens)

  if (whereClause) {
    totalQuery.where(whereClause)
  }

  const [{ total }] = await totalQuery

  const data = rows.map(row => ({
    id: row.id,
    email: row.email,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString()
  }))

  return c.json(
    buildPagedResponse(data, Number(total), query.limit, query.offset),
    HttpStatusCodes.OK
  )
}

export const listAdminInvites: AppRouteHandler<ListAdminInvitesRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  const query = c.req.valid('query')
  const now = new Date()

  const conditions = []
  if (!query.includeExpired) {
    conditions.push(gt(adminInviteTokens.expiresAt, now))
  }
  if (query.q) {
    conditions.push(ilike(adminInviteTokens.email, `%${query.q}%`))
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db.query.adminInviteTokens.findMany({
    where: whereClause,
    columns: {
      id: true,
      email: true,
      expiresAt: true,
      createdAt: true
    },
    orderBy(fields, operators) {
      const direction = query.sortDir === 'desc' ? operators.desc : operators.asc
      return query.sortBy === 'createdAt'
        ? direction(fields.createdAt)
        : direction(fields.expiresAt)
    },
    limit: query.limit,
    offset: query.offset
  })

  const totalQuery = db
    .select({ total: sql<number>`count(*)` })
    .from(adminInviteTokens)

  if (whereClause) {
    totalQuery.where(whereClause)
  }

  const [{ total }] = await totalQuery

  const data = rows.map(row => ({
    id: row.id,
    email: row.email,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString()
  }))

  return c.json(
    buildPagedResponse(data, Number(total), query.limit, query.offset),
    HttpStatusCodes.OK
  )
}

export const deleteAdminInvite: AppRouteHandler<DeleteAdminInviteRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  const payload = c.req.valid('param')
  const [deleted] = await db.delete(adminInviteTokens)
    .where(eq(adminInviteTokens.id, payload.id))
    .returning({ id: adminInviteTokens.id })

  if (!deleted) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

export const inviteAdmin: AppRouteHandler<InviteAdminRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  const payload = c.req.valid('json')

  const existing = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, payload.email)
    },
    columns: { id: true }
  })

  if (existing) {
    return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
  }

  const invite = await issueAdminInviteToken(payload.email)
  const message = buildAdminInviteMessage(invite.token)
  sendMail({
    to: payload.email,
    subject: message.subject,
    text: message.text,
    html: message.html
  }).catch(err => console.error('Failed to send email:', err))

  return c.json({ message: 'Invito inviato.' }, HttpStatusCodes.OK)
}

export const confirmAdminInvite: AppRouteHandler<ConfirmAdminInviteRoute> = async (c) => {
  const payload = c.req.valid('json')
  const invite = await consumeAdminInviteToken(payload.token)

  if (!invite) {
    return unauthorized(c)
  }

  const existing = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, invite.email)
    },
    columns: { id: true }
  })

  if (existing) {
    return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
  }

  const passwordHash = await hashPassword(payload.password)
  const [inserted] = await db.insert(users)
    .values({
      email: invite.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      passwordHash,
      role: 'admin',
      emailVerifiedAt: new Date()
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

  await db.insert(adminProfiles).values({
    userId: inserted.id,
    isActive: false
  })

  const confirmation = buildRegistrationConfirmedMessage()
  sendMail({
    to: inserted.email,
    subject: confirmation.subject,
    text: confirmation.text,
    html: confirmation.html
  }).catch(err => console.error('Failed to send email:', err))

  return c.json(
    {
      ...inserted,
      sectionId: null,
      year: null,
      isActive: false
    },
    HttpStatusCodes.CREATED
  )
}

export const deleteTutorInvite: AppRouteHandler<DeleteTutorInviteRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  const payload = c.req.valid('param')
  const [deleted] = await db.delete(tutorInviteTokens)
    .where(eq(tutorInviteTokens.id, payload.id))
    .returning({ id: tutorInviteTokens.id })

  if (!deleted) {
    return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
  }

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}

export const inviteTutor: AppRouteHandler<InviteTutorRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin' || currentUser.isActive !== true) {
    return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
  }

  const payload = c.req.valid('json')

  const existing = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, payload.email)
    },
    columns: { id: true }
  })

  if (existing) {
    return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
  }

  const invite = await issueTutorInviteToken(payload.email)
  const message = buildTutorInviteMessage(invite.token)
  sendMail({
    to: payload.email,
    subject: message.subject,
    text: message.text,
    html: message.html
  }).catch(err => console.error('Failed to send email:', err))

  return c.json({ message: 'Invito inviato.' }, HttpStatusCodes.OK)
}

export const confirmTutorInvite: AppRouteHandler<ConfirmTutorInviteRoute> = async (c) => {
  const payload = c.req.valid('json')
  const invite = await consumeTutorInviteToken(payload.token)

  if (!invite) {
    return unauthorized(c)
  }

  const existing = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, invite.email)
    },
    columns: { id: true }
  })

  if (existing) {
    return c.json(buildDuplicateEmailError(), HttpStatusCodes.CONFLICT)
  }

  const section = await db.query.classSections.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, payload.sectionId as string)
    },
    columns: { id: true }
  })
  if (!section) {
    return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
  }

  const passwordHash = await hashPassword(payload.password)
  const [inserted] = await db.insert(users)
    .values({
      email: invite.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      passwordHash,
      role: 'tutor',
      emailVerifiedAt: new Date()
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

  await db.insert(tutorProfiles).values({
    userId: inserted.id,
    sectionId: payload.sectionId,
    year: payload.year,
    isActive: true
  })

  await db.insert(tutorSettings).values({
    tutorId: inserted.id,
    ...DEFAULT_TUTOR_SETTINGS
  })

  const confirmation = buildRegistrationConfirmedMessage()
  sendMail({
    to: inserted.email,
    subject: confirmation.subject,
    text: confirmation.text,
    html: confirmation.html
  }).catch(err => console.error('Failed to send email:', err))

  return c.json(
    {
      ...inserted,
      sectionId: payload.sectionId ?? null,
      year: payload.year ?? null,
      isActive: true
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
    const resetEmail = buildPasswordResetMessage(reset.token)
    sendMail({
      to: user.email,
      subject: resetEmail.subject,
      text: resetEmail.text,
      html: resetEmail.html
    }).catch(err => console.error('Failed to send email:', err))
  }

  return c.json(
    { message: 'Se l\'account esiste, e stata inviata un\'email di reimpostazione.' },
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
  const message = buildPasswordChangedMessage()
  sendMail({
    to: user.email,
    subject: message.subject,
    text: message.text,
    html: message.html
  }).catch(err => console.error('Failed to send email:', err))

  return c.json(
    { message: 'Password reimpostata con successo.' },
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
    const verificationEmail = buildEmailVerificationMessage(verification.token)
    sendMail({
      to: user.email,
      subject: verificationEmail.subject,
      text: verificationEmail.text,
      html: verificationEmail.html
    }).catch(err => console.error('Failed to send email:', err))
  }

  return c.json(
    { message: 'Se l\'account esiste, e stata inviata un\'email di verifica.' },
    HttpStatusCodes.OK
  )
}

export const confirmEmailVerification: AppRouteHandler<ConfirmEmailVerificationRoute> = async (c) => {
  const payload = c.req.valid('json')
  const user = await consumeEmailVerificationToken(payload.token)

  if (!user) {
    return unauthorized(c)
  }

  const wasVerified = Boolean(user.emailVerifiedAt)
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

  if (!wasVerified && roleRecord?.role === 'student') {
    const confirmation = buildRegistrationConfirmedMessage()
    sendMail({
      to: user.email,
      subject: confirmation.subject,
      text: confirmation.text,
      html: confirmation.html
    }).catch(err => console.error('Failed to send email:', err))
  }

  return c.json(
    { message: 'Email verificata.' },
    HttpStatusCodes.OK
  )
}
