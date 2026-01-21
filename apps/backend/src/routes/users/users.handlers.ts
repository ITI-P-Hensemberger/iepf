// Purpose: Users route handlers.
import type { Context } from 'hono'

import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
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
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { sendMail } from '@/lib/mailer'
import { buildPagedResponse } from '@/lib/pagination'
import { hashPassword } from '@/lib/password'
import { revokeUserRefreshTokens } from '@/lib/refresh-tokens'

import type { CreateRoute, GetOneRoute, ListRoute, PatchRoute, RemoveRoute } from './users.routes'

type HandlerContext = Context<AppBindings>
type UserPublicRecord = Omit<typeof users.$inferSelect, 'passwordHash'>

type UserWithProfile = UserPublicRecord & {
  sectionId: string | null
  sectionName: string | null
  year: number | null
  isActive: boolean
  lessonTokens: number | null
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

function ensureAdminOrActivator(c: HandlerContext) {
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
  if (currentUser.role === 'activator') {
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

function buildTutorProfilePayload(profileUpdates: {
  sectionId?: string
  year?: number
  isActive?: boolean
}) {
  const payload: {
    sectionId?: string
    year?: number
    isActive?: boolean
  } = {}
  if (profileUpdates.sectionId !== undefined) {
    payload.sectionId = profileUpdates.sectionId
  }
  if (profileUpdates.year !== undefined) {
    payload.year = profileUpdates.year
  }
  if (profileUpdates.isActive !== undefined) {
    payload.isActive = profileUpdates.isActive
  }
  return payload
}

async function attachProfiles(records: UserPublicRecord[]): Promise<UserWithProfile[]> {
  const studentIds = records.filter(user => user.role === 'student').map(user => user.id)
  const tutorIds = records.filter(user => user.role === 'tutor').map(user => user.id)
  const adminIds = records.filter(user => user.role === 'admin').map(user => user.id)

  let studentProfilesList: Array<{
    userId: string
    sectionId: string | null
    year: number | null
    isActive: boolean | null
    lessonTokens: number | null
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
        isActive: true,
        lessonTokens: true
      }
    })
  }

  let tutorProfilesList: Array<{
    userId: string
    sectionId: string | null
    year: number | null
    isActive: boolean | null
  }> = []
  if (tutorIds.length > 0) {
    tutorProfilesList = await db.query.tutorProfiles.findMany({
      where(fields, operators) {
        return operators.inArray(fields.userId, tutorIds)
      },
      columns: {
        userId: true,
        sectionId: true,
        year: true,
        isActive: true
      }
    })
  }

  let adminProfilesList: Array<{
    userId: string
    isActive: boolean | null
  }> = []
  if (adminIds.length > 0) {
    adminProfilesList = await db.query.adminProfiles.findMany({
      where(fields, operators) {
        return operators.inArray(fields.userId, adminIds)
      },
      columns: {
        userId: true,
        isActive: true
      }
    })
  }

  const studentProfileMap = new Map(studentProfilesList.map(profile => [profile.userId, profile]))
  const tutorProfileMap = new Map(tutorProfilesList.map(profile => [profile.userId, profile]))
  const adminProfileMap = new Map(adminProfilesList.map(profile => [profile.userId, profile]))

  const sectionIds = new Set<string>()
  for (const profile of studentProfilesList) {
    if (profile.sectionId) {
      sectionIds.add(profile.sectionId)
    }
  }
  for (const profile of tutorProfilesList) {
    if (profile.sectionId) {
      sectionIds.add(profile.sectionId)
    }
  }

  const sectionNameMap = new Map<string, string>()
  if (sectionIds.size > 0) {
    const sections = await db.query.classSections.findMany({
      where(fields, operators) {
        return operators.inArray(fields.id, Array.from(sectionIds))
      },
      columns: {
        id: true,
        name: true
      }
    })
    sections.forEach((section) => {
      sectionNameMap.set(section.id, section.name)
    })
  }

  const resolveSectionName = (sectionId: string | null | undefined) => {
    if (!sectionId) {
      return null
    }
    return sectionNameMap.get(sectionId) ?? null
  }

  return records.map((user) => {
    if (user.role === 'student') {
      const profile = studentProfileMap.get(user.id)
      return {
        ...user,
        sectionId: profile?.sectionId ?? null,
        sectionName: resolveSectionName(profile?.sectionId ?? null),
        year: profile?.year ?? null,
        isActive: profile?.isActive ?? false,
        lessonTokens: profile?.lessonTokens ?? 0
      }
    }

    if (user.role === 'tutor') {
      const profile = tutorProfileMap.get(user.id)
      return {
        ...user,
        sectionId: profile?.sectionId ?? null,
        sectionName: resolveSectionName(profile?.sectionId ?? null),
        year: profile?.year ?? null,
        isActive: profile?.isActive ?? true,
        lessonTokens: null
      }
    }

    if (user.role === 'admin') {
      const profile = adminProfileMap.get(user.id)
      return {
        ...user,
        sectionId: null,
        sectionName: null,
        year: null,
        isActive: profile?.isActive ?? false,
        lessonTokens: null
      }
    }

    return {
      ...user,
      sectionId: null,
      sectionName: null,
      year: null,
      isActive: false,
      lessonTokens: null
    }
  })
}

export const list: AppRouteHandler<ListRoute> = async (c) => {
  const currentUser = ensureAdminOrActivator(c)
  const query = c.req.valid('query')
  if (currentUser.role === 'activator' && query.role && query.role !== 'student') {
    forbid()
  }

  const conditions = []
  const roleFilter = currentUser.role === 'activator' ? 'student' : query.role
  if (roleFilter) {
    conditions.push(eq(users.role, roleFilter))
  }
  if (query.emailVerified !== undefined) {
    conditions.push(query.emailVerified ? isNotNull(users.emailVerifiedAt) : isNull(users.emailVerifiedAt))
  }
  const records = await db.query.users.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    columns: {
      passwordHash: false
    }
  })

  let withProfiles = await attachProfiles(records)

  if (query.sectionId) {
    withProfiles = withProfiles.filter(user => user.sectionId === query.sectionId)
  }
  if (query.year !== undefined) {
    withProfiles = withProfiles.filter(user => user.year === query.year)
  }
  if (query.isActive !== undefined) {
    withProfiles = withProfiles.filter(user => user.isActive === query.isActive)
  }

  if (query.q) {
    const needle = query.q.toLowerCase()
    withProfiles = withProfiles.filter((user) => {
      const year = user.year != null ? String(user.year) : ''
      const sectionDisplay = (user.sectionName ?? user.sectionId ?? '').toLowerCase()
      return user.email.toLowerCase().includes(needle)
        || user.firstName.toLowerCase().includes(needle)
        || user.lastName.toLowerCase().includes(needle)
        || user.role.toLowerCase().includes(needle)
        || sectionDisplay.includes(needle)
        || year.includes(needle)
    })
  }

  const direction = query.sortDir === 'desc' ? -1 : 1
  const sortBy = query.sortBy
  withProfiles.sort((a, b) => {
    const aValue = (() => {
      switch (sortBy) {
        case 'firstName':
          return a.firstName
        case 'lastName':
          return a.lastName
        case 'email':
          return a.email
        case 'createdAt':
          return a.createdAt
        case 'sectionId':
          return a.sectionName ?? ''
        case 'year':
          return a.year ?? -1
        default:
          return a.lastName
      }
    })()
    const bValue = (() => {
      switch (sortBy) {
        case 'firstName':
          return b.firstName
        case 'lastName':
          return b.lastName
        case 'email':
          return b.email
        case 'createdAt':
          return b.createdAt
        case 'sectionId':
          return b.sectionName ?? ''
        case 'year':
          return b.year ?? -1
        default:
          return b.lastName
      }
    })()

    if (aValue === bValue) {
      return 0
    }
    if (aValue === null || aValue === undefined) {
      return 1
    }
    if (bValue === null || bValue === undefined) {
      return -1
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return (aValue - bValue) * direction
    }
    if (aValue instanceof Date && bValue instanceof Date) {
      return (aValue.getTime() - bValue.getTime()) * direction
    }
    return String(aValue).localeCompare(String(bValue)) * direction
  })

  const start = query.offset
  const end = query.offset + query.limit
  const paged = withProfiles.slice(start, end)
  const total = withProfiles.length

  return c.json(buildPagedResponse(paged, total, query.limit, query.offset), HttpStatusCodes.OK)
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
    year: profileUpdates.year,
    isActive: profileUpdates.isActive
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
      buildErrorResponse('L\'anno deve essere compreso tra 1 e 3', {
        name: 'ZodError',
        issues: [
          {
            code: ZOD_ERROR_CODES.INVALID_UPDATES,
            path: ['year'],
            message: 'L\'anno deve essere compreso tra 1 e 3'
          }
        ]
      }),
      HttpStatusCodes.UNPROCESSABLE_ENTITY
    )
  }

  if (user.role === 'tutor' && profileUpdates.year !== undefined
    && (profileUpdates.year < 4 || profileUpdates.year > 5)) {
    return c.json(
      buildErrorResponse('L\'anno deve essere compreso tra 4 e 5', {
        name: 'ZodError',
        issues: [
          {
            code: ZOD_ERROR_CODES.INVALID_UPDATES,
            path: ['year'],
            message: 'L\'anno deve essere compreso tra 4 e 5'
          }
        ]
      }),
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
      return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
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
      if (tutorProfileUpdates.sectionId === undefined || tutorProfileUpdates.year === undefined) {
        return c.json(
          buildErrorResponse('Sezione e anno sono obbligatori per i tutor', {
            name: 'ZodError',
            issues: [
              {
                code: ZOD_ERROR_CODES.INVALID_UPDATES,
                path: ['sectionId', 'year'],
                message: 'Sezione e anno sono obbligatori per i tutor'
              }
            ]
          }),
          HttpStatusCodes.UNPROCESSABLE_ENTITY
        )
      }
      await db.insert(tutorProfiles).values({
        userId: inserted.id,
        sectionId: tutorProfileUpdates.sectionId,
        year: tutorProfileUpdates.year
      })

      const verification = await issueEmailVerificationToken(inserted.id)
      const tutorEmail = buildTutorCreatedMessage(verification.token)
      sendMail({
        to: inserted.email,
        subject: tutorEmail.subject,
        text: tutorEmail.text,
        html: tutorEmail.html
      }).catch(err => console.error('Failed to send email:', err))
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
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }

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
      buildErrorResponse(HttpStatusPhrases.NOT_FOUND),
      HttpStatusCodes.NOT_FOUND
    )
  }

  if (currentUser.role === 'admin') {
    if (currentUser.isActive !== true && currentUser.id !== id) {
      forbid()
    }
  }
  else if (currentUser.role === 'activator') {
    if (user.role !== 'student') {
      forbid()
    }
  }
  else if (currentUser.id !== id) {
    forbid()
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
  const currentUser = c.get('currentUser')
  if (!currentUser) {
    forbid()
  }
  const isAdmin = currentUser.role === 'admin'
  const isActivator = currentUser.role === 'activator'
  if (isAdmin) {
    if (currentUser.isActive !== true && currentUser.id !== id) {
      forbid()
    }
  }
  else if (!isActivator && currentUser.id !== id) {
    forbid()
  }
  if (isActivator) {
    const hasDisallowedUpdate = updates.email !== undefined
      || updates.firstName !== undefined
      || updates.lastName !== undefined
      || updates.password !== undefined
      || updates.sectionId !== undefined
      || updates.year !== undefined
    if (hasDisallowedUpdate || updates.isActive === undefined) {
      forbid()
    }
  }

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
    year: profileUpdates.year,
    isActive: profileUpdates.isActive
  }
  const tutorProfilePayload = buildTutorProfilePayload(profileUpdates)
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
        role: true,
        email: true,
        firstName: true,
        lastName: true
      }
    })

    if (!existing) {
      return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
    }

    if (hasProfileUpdates && currentUser?.role !== 'admin' && currentUser?.role !== 'activator') {
      return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
    }

    if (hasProfileUpdates && existing.role === 'admin'
      && (profileUpdates.sectionId !== undefined || profileUpdates.year !== undefined)) {
      return c.json(
        buildErrorResponse('Sezioni e anno sono consentiti solo per studenti e tutor', {
          name: 'ZodError',
          issues: [
            {
              code: ZOD_ERROR_CODES.INVALID_UPDATES,
              path: ['role'],
              message: 'Sezioni e anno sono consentiti solo per studenti e tutor'
            }
          ]
        }),
        HttpStatusCodes.UNPROCESSABLE_ENTITY
      )
    }

    let currentStudentProfile: {
      sectionId: string | null
      year: number | null
      isActive: boolean | null
    } | null = null
    let currentTutorProfile: {
      sectionId: string | null
      year: number | null
      isActive: boolean | null
    } | null = null
    let currentAdminProfile: {
      isActive: boolean | null
    } | null = null

    if (currentUser?.role === 'activator' && existing.role !== 'student') {
      return c.json(buildErrorResponse(HttpStatusPhrases.FORBIDDEN), HttpStatusCodes.FORBIDDEN)
    }

    if (hasProfileUpdates && existing.role === 'student') {
      currentStudentProfile = (await db.query.studentProfiles.findFirst({
        where(fields, operators) {
          return operators.eq(fields.userId, id)
        },
        columns: {
          sectionId: true,
          year: true,
          isActive: true,
          lessonTokens: true
        }
      })) ?? null
    }

    if (hasProfileUpdates && existing.role === 'tutor') {
      currentTutorProfile = (await db.query.tutorProfiles.findFirst({
        where(fields, operators) {
          return operators.eq(fields.userId, id)
        },
        columns: {
          sectionId: true,
          year: true,
          isActive: true
        }
      })) ?? null
    }

    if (hasProfileUpdates && existing.role === 'admin') {
      currentAdminProfile = (await db.query.adminProfiles.findFirst({
        where(fields, operators) {
          return operators.eq(fields.userId, id)
        },
        columns: {
          isActive: true
        }
      })) ?? null
    }

    if (hasProfileUpdates && existing.role === 'tutor') {
      if (profileUpdates.sectionId === undefined || profileUpdates.year === undefined) {
        return c.json(
          buildErrorResponse('Sezione e anno sono obbligatori per i tutor', {
            name: 'ZodError',
            issues: [
              {
                code: ZOD_ERROR_CODES.INVALID_UPDATES,
                path: ['sectionId', 'year'],
                message: 'Sezione e anno sono obbligatori per i tutor'
              }
            ]
          }),
          HttpStatusCodes.UNPROCESSABLE_ENTITY
        )
      }
    }

    if (existing.role === 'student' && profileUpdates.isActive !== undefined) {
      previousIsActive = currentStudentProfile?.isActive ?? null
    }

    if (existing.role === 'admin' && profileUpdates.isActive !== undefined) {
      previousIsActive = currentAdminProfile?.isActive ?? null
    }
    if (existing.role === 'tutor' && profileUpdates.isActive !== undefined) {
      previousIsActive = currentTutorProfile?.isActive ?? null
    }

    if (hasProfileUpdates && existing.role === 'student') {
      if (profileUpdates.year !== undefined && (profileUpdates.year < 1 || profileUpdates.year > 3)) {
        return c.json(
          buildErrorResponse('L\'anno deve essere compreso tra 1 e 3', {
            name: 'ZodError',
            issues: [
              {
                code: ZOD_ERROR_CODES.INVALID_UPDATES,
                path: ['year'],
                message: 'L\'anno deve essere compreso tra 1 e 3'
              }
            ]
          }),
          HttpStatusCodes.UNPROCESSABLE_ENTITY
        )
      }
    }

    if (hasProfileUpdates && existing.role === 'tutor') {
      if (profileUpdates.year !== undefined && (profileUpdates.year < 4 || profileUpdates.year > 5)) {
        return c.json(
          buildErrorResponse('L\'anno deve essere compreso tra 4 e 5', {
            name: 'ZodError',
            issues: [
              {
                code: ZOD_ERROR_CODES.INVALID_UPDATES,
                path: ['year'],
                message: 'L\'anno deve essere compreso tra 4 e 5'
              }
            ]
          }),
          HttpStatusCodes.UNPROCESSABLE_ENTITY
        )
      }
    }

    const userChanged = passwordChanged
      || (updates.email !== undefined && updates.email !== existing.email)
      || (updates.firstName !== undefined && updates.firstName !== existing.firstName)
      || (updates.lastName !== undefined && updates.lastName !== existing.lastName)
    let profileChanged = false

    if (hasProfileUpdates && existing.role === 'student') {
      profileChanged = (profileUpdates.sectionId !== undefined
        && profileUpdates.sectionId !== (currentStudentProfile?.sectionId ?? null))
      || (profileUpdates.year !== undefined
        && profileUpdates.year !== (currentStudentProfile?.year ?? null))
      || (profileUpdates.isActive !== undefined
        && profileUpdates.isActive !== (currentStudentProfile?.isActive ?? null))
    }

    if (hasProfileUpdates && existing.role === 'tutor') {
      profileChanged = (profileUpdates.sectionId !== undefined
        && profileUpdates.sectionId !== (currentTutorProfile?.sectionId ?? null))
      || (profileUpdates.year !== undefined
        && profileUpdates.year !== (currentTutorProfile?.year ?? null))
    }

    if (hasProfileUpdates && existing.role === 'admin') {
      profileChanged = profileUpdates.isActive !== undefined
        && profileUpdates.isActive !== (currentAdminProfile?.isActive ?? null)
    }

    if (!userChanged && !profileChanged) {
      const currentUserRecord = await db.query.users.findFirst({
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

      if (!currentUserRecord) {
        return c.json(buildErrorResponse(HttpStatusPhrases.NOT_FOUND), HttpStatusCodes.NOT_FOUND)
      }

      const [withProfile] = await attachProfiles([currentUserRecord])
      return c.json(withProfile, HttpStatusCodes.OK)
    }

    if (profileUpdates.sectionId) {
      const section = await db.query.classSections.findFirst({
        where(fields, operators) {
          return operators.eq(fields.id, profileUpdates.sectionId as string)
        },
        columns: { id: true }
      })
      if (!section) {
        return c.json(buildErrorResponse(HttpStatusPhrases.BAD_REQUEST), HttpStatusCodes.BAD_REQUEST)
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
        .set(tutorProfilePayload)
        .where(eq(tutorProfiles.userId, id))
      if (result.rowCount === 0) {
        await db.insert(tutorProfiles).values({
          userId: id,
          sectionId: tutorProfileUpdates.sectionId as string,
          year: tutorProfileUpdates.year as number,
          isActive: tutorProfilePayload.isActive ?? currentTutorProfile?.isActive ?? true
        })
      }
    }

    if (existing.role === 'admin' && hasProfileUpdates) {
      const result = await db.update(adminProfiles)
        .set({ isActive: profileUpdates.isActive })
        .where(eq(adminProfiles.userId, id))
      if (result.rowCount === 0) {
        await db.insert(adminProfiles).values({
          userId: id,
          isActive: profileUpdates.isActive ?? false
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
      sendMail({
        to: user.email,
        subject: message.subject,
        text: message.text,
        html: message.html
      }).catch(err => console.error('Failed to send email:', err))
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
      buildErrorResponse(HttpStatusPhrases.NOT_FOUND),
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
      buildErrorResponse(HttpStatusPhrases.NOT_FOUND),
      HttpStatusCodes.NOT_FOUND
    )
  }

  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
