// Purpose: Users route handlers.
import type { Context } from 'hono'

import { and, eq, isNotNull, isNull } from 'drizzle-orm'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import { listActivationHistory, recordActivationChange } from '@/lib/activation-history'
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { isUniqueConstraintError } from '@/lib/db-errors'
import {
  buildActivationChangedMessage,
  buildProfileUpdatedMessage
} from '@/lib/email-templates'
import { buildErrorResponse } from '@/lib/error-response'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { getStudentTokenBalances } from '@/lib/lesson-tokens'
import { sendMail } from '@/lib/mailer'
import { buildPagedResponse } from '@/lib/pagination'
import { verifyPassword } from '@/lib/password'
import { notifyUsers } from '@/lib/push'
import { activationChangedPush } from '@/lib/push-messages'
import { ensureAdmin, forbid } from '@/lib/require-admin'
import { isYearInRange, STUDENT_YEARS, TUTOR_YEARS, yearRangeMessage } from '@/lib/school-years'

import type { ActivationHistoryRoute, GetOneRoute, ListRoute, PatchRoute, RemoveRoute } from './users.routes'

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

// A note only goes with a deactivation; empty means none.
function deactivationReasonOf(updates: Record<string, unknown>) {
  return updates.isActive === false && typeof updates.deactivationReason === 'string' && updates.deactivationReason !== ''
    ? updates.deactivationReason
    : null
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
    deactivatedAt: Date | null
    deactivationReason: string | null
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
        deactivatedAt: true,
        deactivationReason: true
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
  const tokenBalances = await getStudentTokenBalances(studentIds)

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
        deactivatedAt: profile?.isActive ? null : (profile?.deactivatedAt ?? null),
        deactivationReason: profile?.isActive ? null : (profile?.deactivationReason ?? null),
        lessonTokens: tokenBalances.get(user.id) ?? 0
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
  if (query.isActive === false && (currentUser.role === 'admin' || currentUser.role === 'activator')) {
    conditions.push(isNotNull(users.emailVerifiedAt))
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
  if (currentUser.role === 'activator') {
    withProfiles = withProfiles.filter(user => !('deactivatedAt' in user && user.deactivatedAt))
  }
  if (query.deactivated !== undefined) {
    withProfiles = withProfiles.filter(user => Boolean('deactivatedAt' in user && user.deactivatedAt) === query.deactivated)
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
        case 'lessonTokens':
          return a.lessonTokens ?? -1
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
        case 'lessonTokens':
          return b.lessonTokens ?? -1
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

  if (currentUser.role === 'tutor') {
    if (currentUser.id === id) {
      const [withProfile] = await attachProfiles([user])
      return c.json(withProfile, HttpStatusCodes.OK)
    }
    if (user.role !== 'student') {
      forbid()
    }
    const [withProfile] = await attachProfiles([user])
    return c.json(
      {
        id: withProfile.id,
        firstName: withProfile.firstName,
        lastName: withProfile.lastName,
        email: withProfile.email,
        sectionId: withProfile.sectionId,
        sectionName: withProfile.sectionName,
        year: withProfile.year
      },
      HttpStatusCodes.OK
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
  // Activators deal with students never activated and active ones: a deactivated student is an admin's matter.
  if (currentUser.role === 'activator' && 'deactivatedAt' in withProfile && withProfile.deactivatedAt) {
    forbid()
  }
  return c.json(withProfile, HttpStatusCodes.OK)
}

// Admins only: the history names who acted, activators included.
export const activationHistory: AppRouteHandler<ActivationHistoryRoute> = async (c) => {
  ensureAdmin(c)
  const { id } = c.req.valid('param')
  return c.json(await listActivationHistory(id), HttpStatusCodes.OK)
}

export const patch: AppRouteHandler<PatchRoute> = async (c) => {
  const { id } = c.req.valid('param')
  const updates = c.req.valid('json') as {
    email?: string
    firstName?: string
    lastName?: string
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
  // Students and tutors change only their name: a new email would let whoever holds the
  // session receive the password reset link.
  if (!isAdmin && !isActivator && updates.email !== undefined) {
    forbid()
  }
  if (isActivator) {
    const hasDisallowedUpdate = updates.email !== undefined
      || updates.firstName !== undefined
      || updates.lastName !== undefined
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
  } = {
    email: updates.email?.trim().toLowerCase(),
    firstName: updates.firstName,
    lastName: updates.lastName
  }
  const profileUpdates = extractProfileUpdates(updates)
  const deactivationReason = deactivationReasonOf(updates)
  const studentProfileUpdates: Partial<typeof studentProfiles.$inferInsert> = {
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
  let previousIsActive: boolean | null | undefined
  const hasProfileUpdates = Object.values(profileUpdates).some(value => value !== undefined)
  const hasUserUpdates = Object.values(userUpdates).some(value => value !== undefined)

  if (typeof updates.email === 'string') {
    const email = updates.email.trim().toLowerCase()
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
      deactivatedAt: Date | null
    } | null = null
    let currentTutorProfile: {
      sectionId: string | null
      year: number | null
      isActive: boolean | null
    } | null = null
    let currentAdminProfile: {
      isActive: boolean | null
    } | null = null

    // Activators only turn students on: turning one off is an admin's call.
    if (currentUser?.role === 'activator' && (existing.role !== 'student' || updates.isActive === false)) {
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
          deactivatedAt: true
        }
      })) ?? null
      // Activators only turn on students never activated: reactivating is an admin's call.
      if (currentUser.role === 'activator' && currentStudentProfile?.deactivatedAt) {
        forbid()
      }
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
      if (profileUpdates.year !== undefined && !isYearInRange(profileUpdates.year, STUDENT_YEARS)) {
        return c.json(
          buildErrorResponse(yearRangeMessage(STUDENT_YEARS), {
            name: 'ZodError',
            issues: [
              {
                code: ZOD_ERROR_CODES.INVALID_UPDATES,
                path: ['year'],
                message: yearRangeMessage(STUDENT_YEARS)
              }
            ]
          }),
          HttpStatusCodes.UNPROCESSABLE_ENTITY
        )
      }
    }

    if (hasProfileUpdates && existing.role === 'tutor') {
      if (profileUpdates.year !== undefined && !isYearInRange(profileUpdates.year, TUTOR_YEARS)) {
        return c.json(
          buildErrorResponse(yearRangeMessage(TUTOR_YEARS), {
            name: 'ZodError',
            issues: [
              {
                code: ZOD_ERROR_CODES.INVALID_UPDATES,
                path: ['year'],
                message: yearRangeMessage(TUTOR_YEARS)
              }
            ]
          }),
          HttpStatusCodes.UNPROCESSABLE_ENTITY
        )
      }
    }

    const userChanged = (updates.email !== undefined && updates.email !== existing.email)
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
      || (profileUpdates.isActive !== undefined
        && profileUpdates.isActive !== (currentTutorProfile?.isActive ?? null))
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
          lastName: userUpdates.lastName
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
      if (profileUpdates.isActive === false && previousIsActive === true) {
        studentProfileUpdates.deactivatedAt = new Date()
        studentProfileUpdates.deactivationReason = deactivationReason
      }
      else if (profileUpdates.isActive === true) {
        studentProfileUpdates.deactivatedAt = null
        studentProfileUpdates.deactivationReason = null
      }
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
      // Turning an admin off by hand is not the same as one still waiting to be activated.
      const deactivated = profileUpdates.isActive === false && previousIsActive === true
      const result = await db.update(adminProfiles)
        .set({ isActive: profileUpdates.isActive, ...(deactivated ? { deactivatedAt: new Date() } : {}) })
        .where(eq(adminProfiles.userId, id))
      if (result.rowCount === 0) {
        await db.insert(adminProfiles).values({
          userId: id,
          isActive: profileUpdates.isActive ?? false
        })
      }
    }

    const activationChanged = previousIsActive !== undefined
      && profileUpdates.isActive !== undefined
      && previousIsActive !== profileUpdates.isActive
    if (user && activationChanged) {
      await recordActivationChange({ userId: id, isActive: Boolean(profileUpdates.isActive), reason: deactivationReason, actorId: currentUser!.id })
    }

    if (user?.email) {
      if (hasUserUpdates || hasProfileUpdates) {
        const message = activationChanged
          ? buildActivationChangedMessage(Boolean(profileUpdates.isActive), deactivationReason)
          : buildProfileUpdatedMessage()
        sendMail({
          to: user.email,
          subject: message.subject,
          text: message.text,
          html: message.html
        }).catch(err => console.error('Failed to send profile update email:', err))
        if (activationChanged) {
          notifyUsers([id], 'account', activationChangedPush(Boolean(profileUpdates.isActive), deactivationReason))
        }
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
      buildErrorResponse(HttpStatusPhrases.NOT_FOUND),
      HttpStatusCodes.NOT_FOUND
    )
  }

  const [withProfile] = await attachProfiles([user])
  return c.json(withProfile, HttpStatusCodes.OK)
}

export const remove: AppRouteHandler<RemoveRoute> = async (c) => {
  const admin = ensureAdmin(c)

  const { id } = c.req.valid('param')
  const { password } = c.req.valid('json')
  // Deleting yourself could leave nobody able to manage the site.
  if (id === admin.id) {
    return c.json(buildErrorResponse('Non puoi eliminare il tuo account.'), HttpStatusCodes.FORBIDDEN)
  }
  const own = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, admin.id)
    },
    columns: { passwordHash: true }
  })
  if (!own || !(await verifyPassword(own.passwordHash, password))) {
    return c.json(buildErrorResponse('Password non corretta.'), HttpStatusCodes.FORBIDDEN)
  }
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
