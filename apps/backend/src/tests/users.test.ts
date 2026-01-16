// Purpose: Users and auth integration tests.
import { eq } from 'drizzle-orm'
import { testClient } from 'hono/testing'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'

import type { AuthenticatedUser } from '@/lib/types'

import db from '@/db'
import { classSections } from '@/db/schemas/class-sections.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { createAccessToken } from '@/lib/auth'
import { ZOD_ERROR_CODES, ZOD_ERROR_MESSAGES } from '@/lib/constants'
import { createTestApp } from '@/lib/create-app'
import { issueEmailVerificationToken } from '@/lib/email-verification'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { issuePasswordResetToken } from '@/lib/password-reset'
import { resetRateLimiters } from '@/middlewares/rate-limit'
import authRouter from '@/routes/auth/auth.index'
import router from '@/routes/users/users.index'
import { ensureTestSchema } from '@/tests/test-setup'

if (env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV must be \'test\'')
}

const client = testClient(createTestApp(router)) as any
const authClient = testClient(createTestApp(authRouter)) as any
const usersById = (client.users as typeof client.users & Record<
  ':id',
  typeof client.users
>)[':id']

const adminIdentity: AuthenticatedUser = {
  id: 'admin-user',
  email: 'admin@example.com',
  role: 'admin'
}

let adminToken = ''

interface UserResponse {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  emailVerifiedAt?: string | null
  sectionId?: string | null
  year?: number | null
  isActive?: boolean | null
  createdAt: string
  updatedAt: string
}

interface ErrorResponse {
  success: boolean
  error: {
    name: string
    issues: Array<{
      code: string
      path: Array<string | number>
      message?: string
      params?: Record<string, unknown>
    }>
  }
}

interface AuthTokenResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  refreshToken: string
  refreshTokenExpiresIn: number
}

interface MessageResponse {
  message: string
}

interface CreateUserPayload {
  email: string
  firstName: string
  lastName: string
  password: string
  role?: 'student' | 'tutor'
}

const baseUser: Omit<CreateUserPayload, 'email'> = {
  firstName: 'Jordan',
  lastName: 'Developer',
  password: 'Sup3rSecret!'
}

let emailCounter = 0

function bearer(token: string) {
  return {
    Authorization: `Bearer ${token}`
  }
}

async function issueToken(user: AuthenticatedUser) {
  const { token } = await createAccessToken(user)
  return token
}

async function tokenForUser(user: UserResponse) {
  return issueToken({
    id: user.id,
    email: user.email,
    role: user.role as AuthenticatedUser['role']
  })
}

function buildUserPayload(overrides: Partial<CreateUserPayload> = {}): CreateUserPayload {
  emailCounter += 1
  const payload: CreateUserPayload = {
    email: overrides.email ?? `user${emailCounter}@example.com`,
    firstName: overrides.firstName ?? `${baseUser.firstName}${emailCounter}`,
    lastName: overrides.lastName ?? baseUser.lastName,
    password: overrides.password ?? baseUser.password
  }
  if (overrides.role) {
    payload.role = overrides.role
  }
  return payload
}

async function createUserFixture(overrides: Partial<CreateUserPayload> = {}) {
  const payload = buildUserPayload(overrides)
  if (!adminToken) {
    throw new Error('Admin token not initialized')
  }
  const response = await client.users.$post({
    json: payload,
    header: bearer(adminToken)
  })
  expect(response.status).toBe(HttpStatusCodes.CREATED)
  const body = (await response.json()) as UserResponse

  return {
    payload,
    user: body
  }
}

async function verifyUserEmail(userId: string) {
  await db.update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, userId))
}

beforeAll(async () => {
  await ensureTestSchema()
  adminToken = await issueToken(adminIdentity)
})

beforeEach(async () => {
  emailCounter = 0
  await db.delete(classSections)
  await db.delete(users)
  await db.delete(tutorSettings)
  resetRateLimiters()
})

afterAll(async () => {
  fs.rmSync('test.db', { force: true })
})

describe('users routes', () => {
  it('returns an empty list when no users exist', async () => {
    const response = await client.users.$get({
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as UserResponse[]
    expect(body).toEqual([])
  })

  it('rejects requests without authentication', async () => {
    const response = await client.users.$get({})
    expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED)
  })

  it('prevents non-admin users from listing all users', async () => {
    const { user } = await createUserFixture()
    const studentToken = await tokenForUser(user)

    const response = await client.users.$get({
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.FORBIDDEN)
  })

  it('creates a user and returns sanitized payload with Location header', async () => {
    const payload = buildUserPayload()
    const response = await client.users.$post({
      json: payload,
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.CREATED)
    const body = (await response.json()) as UserResponse

    expect(response.headers.get('Location')).toBe(`/users/${body.id}`)
    expect(body).toMatchObject({
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      role: 'student',
      isActive: false
    })
    expectTypeOf(body.id).toBeString()
    expect(new Date(body.createdAt).toString()).not.toBe('Invalid Date')
    expect(new Date(body.updatedAt).toString()).not.toBe('Invalid Date')
    expect(body).not.toHaveProperty('password')
  })

  it('allows admins to create tutor users', async () => {
    const payload = buildUserPayload({
      email: 'tutor@example.com',
      role: 'tutor'
    })
    const response = await client.users.$post({
      json: payload,
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
    const body = (await response.json()) as UserResponse
    expect(body.role).toBe('tutor')
  })

  it('assigns section and year to students during admin creation', async () => {
    const [section] = await db.insert(classSections).values({
      name: 'D1'
    }).returning({ id: classSections.id })

    const payload = buildUserPayload({
      email: 'student-section@example.com',
      role: 'student'
    })

    const response = await client.users.$post({
      json: {
        ...payload,
        sectionId: section.id,
        year: 2
      },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
    const body = (await response.json()) as UserResponse
    expect(body.sectionId).toBe(section.id)
    expect(body.year).toBe(2)
  })

  it('allows admins to activate students', async () => {
    const { user } = await createUserFixture()
    const response = await usersById.$patch({
      param: { id: user.id },
      json: { isActive: true },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as UserResponse
    expect(body.isActive).toBe(true)
  })

  it('rejects activation updates from non-admin users', async () => {
    const { user } = await createUserFixture()
    const studentToken = await tokenForUser(user)

    const response = await usersById.$patch({
      param: { id: user.id },
      json: { isActive: true },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.FORBIDDEN)
  })

  it('rejects invalid student years', async () => {
    const payload = buildUserPayload({
      email: 'student-year@example.com',
      role: 'student'
    })

    const response = await client.users.$post({
      json: {
        ...payload,
        year: 5
      },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('rejects invalid tutor years', async () => {
    const payload = buildUserPayload({
      email: 'tutor-year@example.com',
      role: 'tutor'
    })

    const response = await client.users.$post({
      json: {
        ...payload,
        year: 2
      },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('lists existing users without exposing password data', async () => {
    const userA = await createUserFixture()
    const userB = await createUserFixture()

    const response = await client.users.$get({
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as UserResponse[]

    expect(body).toHaveLength(2)
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: userA.user.id, email: userA.user.email, role: 'student' }),
        expect.objectContaining({ id: userB.user.id, email: userB.user.email, role: 'student' })
      ])
    )
    expect(body.every(user => !('password' in user))).toBe(true)
  })

  it('rejects duplicate emails on create', async () => {
    const { payload } = await createUserFixture()

    const response = await client.users.$post({
      json: buildUserPayload({ email: payload.email }),
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CONFLICT)
    const body = (await response.json()) as ErrorResponse
    const issue = body.error.issues[0]

    expect(body.success).toBe(false)
    expect(issue).toMatchObject({
      code: ZOD_ERROR_CODES.DUPLICATE_KEY,
      path: ['email'],
      message: ZOD_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS
    })
  })

  it('allows a user to retrieve their own record', async () => {
    const { user } = await createUserFixture()
    const studentToken = await tokenForUser(user)

    const response = await usersById.$get({
      param: { id: user.id },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as UserResponse
    expect(body).toEqual(user)
  })

  it('prevents users from retrieving other user records', async () => {
    const { user: firstUser } = await createUserFixture()
    const { user: secondUser } = await createUserFixture()
    const studentToken = await tokenForUser(firstUser)

    const response = await usersById.$get({
      param: { id: secondUser.id },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.FORBIDDEN)
  })

  it('retrieves a single user by id', async () => {
    const { user } = await createUserFixture()
    const response = await usersById.$get({
      param: { id: user.id },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as UserResponse
    expect(body).toEqual(user)
  })

  it('returns 404 when user does not exist', async () => {
    const response = await usersById.$get({
      param: { id: randomUUID() },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.NOT_FOUND)
    const body = (await response.json()) as { message: string }
    expect(body).toEqual({ message: HttpStatusPhrases.NOT_FOUND })
  })

  it('validates UUID params for user lookups', async () => {
    const response = await usersById.$get({
      param: { id: 'not-a-uuid' },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.UNPROCESSABLE_ENTITY)
    const body = (await response.json()) as ErrorResponse
    const issue = body.error.issues[0]

    expect(issue.code).toBe('invalid_format')
    expect(issue.path).toEqual(['id'])
    expect(issue.message).toMatch(/uuid/i)
  })

  it('updates mutable fields without returning sensitive data', async () => {
    const { user } = await createUserFixture()
    const studentToken = await tokenForUser(user)
    const response = await usersById.$patch({
      param: { id: user.id },
      json: {
        firstName: 'Updated',
        password: 'AnotherSup3rSecret!'
      },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as UserResponse

    expect(body).toMatchObject({
      id: user.id,
      firstName: 'Updated',
      lastName: user.lastName,
      email: user.email
    })

    expect(body.updatedAt).toEqual(expect.any(String))

    expect(new Date(body.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(user.updatedAt).getTime()
    )

    expect(body).not.toHaveProperty('password')
  })

  it('hashes passwords on patch updates', async () => {
    const { user } = await createUserFixture({ password: 'PlainSecret1!' })
    const studentToken = await tokenForUser(user)

    const existing = await db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, user.id)
      },
      columns: { passwordHash: true }
    })
    expect(existing?.passwordHash).toBeDefined()

    const response = await usersById.$patch({
      param: { id: user.id },
      json: { password: 'PlainSecret2!' },
      header: bearer(studentToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)

    const updated = await db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, user.id)
      },
      columns: { passwordHash: true }
    })

    expect(updated?.passwordHash).toBeDefined()
    expect(updated?.passwordHash).not.toBe(existing?.passwordHash)
    expect(updated?.passwordHash).not.toBe('PlainSecret2!')
  })

  it('rejects duplicate emails when patching existing users', async () => {
    const { user: firstUser } = await createUserFixture({ email: 'primary@example.com' })
    const { user: secondUser } = await createUserFixture({ email: 'secondary@example.com' })

    const secondToken = await tokenForUser(secondUser)
    const response = await usersById.$patch({
      param: { id: secondUser.id },
      json: { email: firstUser.email },
      header: bearer(secondToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CONFLICT)
    const body = (await response.json()) as ErrorResponse
    const issue = body.error.issues[0]

    expect(issue).toMatchObject({
      code: ZOD_ERROR_CODES.DUPLICATE_KEY,
      path: ['email'],
      message: ZOD_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS
    })
  })

  it('prevents users from patching other profiles', async () => {
    const { user: owner } = await createUserFixture()
    const { user: other } = await createUserFixture()
    const ownerToken = await tokenForUser(owner)

    const response = await usersById.$patch({
      param: { id: other.id },
      json: { firstName: 'Blocked' },
      header: bearer(ownerToken)
    })

    expect(response.status).toBe(HttpStatusCodes.FORBIDDEN)
  })

  it('requires at least one field when patching', async () => {
    const { user } = await createUserFixture()
    const studentToken = await tokenForUser(user)
    const response = await usersById.$patch({
      param: { id: user.id },
      json: {},
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.UNPROCESSABLE_ENTITY)
    const body = (await response.json()) as ErrorResponse
    const issue = body.error.issues[0]

    expect(issue.code).toBe('custom')
    expect(issue.message).toBe(ZOD_ERROR_MESSAGES.NO_UPDATES)
    expect(issue.params?.code).toBe(ZOD_ERROR_CODES.INVALID_UPDATES)
  })

  it('returns 404 when patching a missing user', async () => {
    const response = await usersById.$patch({
      param: { id: randomUUID() },
      json: { firstName: 'Ghost' },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.NOT_FOUND)
    const body = (await response.json()) as { message: string }
    expect(body).toEqual({ message: HttpStatusPhrases.NOT_FOUND })
  })

  it('deletes an existing user', async () => {
    const { user } = await createUserFixture()
    const response = await usersById.$delete({
      param: { id: user.id },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.NO_CONTENT)

    const getResponse = await usersById.$get({
      param: { id: user.id },
      header: bearer(adminToken)
    })
    expect(getResponse.status).toBe(HttpStatusCodes.NOT_FOUND)
  })

  it('returns 404 when deleting a missing user', async () => {
    const response = await usersById.$delete({
      param: { id: randomUUID() },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.NOT_FOUND)
    const body = (await response.json()) as { message: string }
    expect(body).toEqual({ message: HttpStatusPhrases.NOT_FOUND })
  })

  it('prevents non-admin users from deleting accounts', async () => {
    const { user } = await createUserFixture()
    const studentToken = await tokenForUser(user)

    const deleteResponse = await usersById.$delete({
      param: { id: user.id },
      header: bearer(studentToken)
    })

    expect(deleteResponse.status).toBe(HttpStatusCodes.FORBIDDEN)
  })
})

describe('auth routes', () => {
  it('registers a student user and requires verification before login', async () => {
    const payload = buildUserPayload({ email: 'register-user@example.com' })
    const response = await authClient.auth.register.$post({
      json: payload
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
    const body = (await response.json()) as UserResponse
    expect(body).toMatchObject({
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      role: 'student',
      isActive: false
    })
    expect(body.emailVerifiedAt ?? null).toBeNull()

    const loginResponse = await authClient.auth.login.$post({
      json: {
        email: payload.email,
        password: payload.password
      }
    })

    expect(loginResponse.status).toBe(HttpStatusCodes.FORBIDDEN)
  })

  it('accepts section and year during student registration', async () => {
    const [section] = await db.insert(classSections).values({
      name: 'D1'
    }).returning({ id: classSections.id })

    const payload = buildUserPayload({ email: 'register-section@example.com' })
    const response = await authClient.auth.register.$post({
      json: {
        ...payload,
        sectionId: section.id,
        year: 2
      }
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
    const body = (await response.json()) as UserResponse
    expect(body.sectionId).toBe(section.id)
    expect(body.year).toBe(2)
  })

  it('rejects role overrides during student registration', async () => {
    const payload = buildUserPayload({ email: 'register-tutor@example.com' })
    const response = await authClient.auth.register.$post({
      json: {
        ...payload,
        role: 'tutor'
      }
    })

    expect(response.status).toBe(HttpStatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('rejects duplicate registration emails', async () => {
    const payload = buildUserPayload({ email: 'duplicate-register@example.com' })
    const first = await authClient.auth.register.$post({ json: payload })
    expect(first.status).toBe(HttpStatusCodes.CREATED)

    const second = await authClient.auth.register.$post({ json: payload })
    expect(second.status).toBe(HttpStatusCodes.CONFLICT)
  })

  it('logs out by revoking refresh tokens', async () => {
    const { payload, user } = await createUserFixture({ email: 'logout-user@example.com' })
    await verifyUserEmail(user.id)

    const loginResponse = await authClient.auth.login.$post({
      json: {
        email: payload.email,
        password: payload.password
      }
    })
    expect(loginResponse.status).toBe(HttpStatusCodes.OK)
    const tokens = await loginResponse.json() as AuthTokenResponse

    const logoutResponse = await authClient.auth.logout.$post({
      json: { refreshToken: tokens.refreshToken }
    })
    expect(logoutResponse.status).toBe(HttpStatusCodes.NO_CONTENT)

    const refreshResponse = await authClient.auth.refresh.$post({
      json: { refreshToken: tokens.refreshToken }
    })
    expect(refreshResponse.status).toBe(HttpStatusCodes.UNAUTHORIZED)
  })

  it('returns access and refresh tokens for valid credentials', async () => {
    const { payload, user } = await createUserFixture({ email: 'auth-user@example.com' })
    await verifyUserEmail(user.id)

    const response = await authClient.auth.login.$post({
      json: {
        email: payload.email,
        password: payload.password
      }
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as AuthTokenResponse
    expect(body.tokenType).toBe('Bearer')
    expect(body.expiresIn).toBeGreaterThan(0)
    expect(body.refreshTokenExpiresIn).toBeGreaterThan(0)
    expect(body.accessToken.length).toBeGreaterThan(10)
    expect(body.refreshToken.length).toBeGreaterThan(10)
  })

  it('rejects invalid credentials', async () => {
    const { payload } = await createUserFixture({ email: 'invalid-auth@example.com' })

    const response = await authClient.auth.login.$post({
      json: {
        email: payload.email,
        password: 'DefinitelyWrongPassword'
      }
    })

    expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED)
  })

  it('rotates refresh tokens and invalidates the previous token', async () => {
    const { payload, user } = await createUserFixture({ email: 'refresh-user@example.com' })
    await verifyUserEmail(user.id)

    const loginResponse = await authClient.auth.login.$post({
      json: {
        email: payload.email,
        password: payload.password
      }
    })
    expect(loginResponse.status).toBe(HttpStatusCodes.OK)
    const initialTokens = await loginResponse.json() as AuthTokenResponse

    const refreshResponse = await authClient.auth.refresh.$post({
      json: { refreshToken: initialTokens.refreshToken }
    })

    expect(refreshResponse.status).toBe(HttpStatusCodes.OK)
    const rotated = await refreshResponse.json() as AuthTokenResponse

    expect(rotated.accessToken).not.toBe(initialTokens.accessToken)
    expect(rotated.refreshToken).not.toBe(initialTokens.refreshToken)

    const reuseResponse = await authClient.auth.refresh.$post({
      json: { refreshToken: initialTokens.refreshToken }
    })

    expect(reuseResponse.status).toBe(HttpStatusCodes.UNAUTHORIZED)
  })

  it('rejects unknown refresh tokens', async () => {
    const response = await authClient.auth.refresh.$post({
      json: { refreshToken: 'not-a-real-token' }
    })

    expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED)
  })

  it('returns ok for password reset requests even when user is missing', async () => {
    const response = await authClient.auth.password.reset.request.$post({
      json: { email: 'missing-user@example.com' }
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as MessageResponse
    expect(body.message).toMatch(/reset email/i)
  })

  it('resets password with a valid reset token', async () => {
    const { payload, user } = await createUserFixture({ email: 'reset-user@example.com' })
    await verifyUserEmail(user.id)

    const reset = await issuePasswordResetToken(user.id)
    const response = await authClient.auth.password.reset.confirm.$post({
      json: {
        token: reset.token,
        password: 'BrandNewSecret123!'
      }
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as MessageResponse
    expect(body.message).toMatch(/reset/i)

    const loginResponse = await authClient.auth.login.$post({
      json: {
        email: payload.email,
        password: 'BrandNewSecret123!'
      }
    })
    expect(loginResponse.status).toBe(HttpStatusCodes.OK)
  })

  it('rejects invalid password reset tokens', async () => {
    const response = await authClient.auth.password.reset.confirm.$post({
      json: {
        token: 'invalid-token',
        password: 'BrandNewSecret123!'
      }
    })

    expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED)
  })

  it('verifies email with a valid verification token', async () => {
    const { user } = await createUserFixture({ email: 'verify-user@example.com' })

    const verification = await issueEmailVerificationToken(user.id)
    const response = await authClient.auth['verify-email'].confirm.$post({
      json: { token: verification.token }
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as MessageResponse
    expect(body.message).toMatch(/verified/i)

    const updated = await db.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, user.id)
      },
      columns: { emailVerifiedAt: true }
    })
    expect(updated?.emailVerifiedAt).toBeDefined()
  })

  it('creates tutor settings when a tutor verifies email', async () => {
    const { user } = await createUserFixture({ email: 'verify-tutor@example.com', role: 'tutor' })

    const verification = await issueEmailVerificationToken(user.id)
    const response = await authClient.auth['verify-email'].confirm.$post({
      json: { token: verification.token }
    })

    expect(response.status).toBe(HttpStatusCodes.OK)

    const settings = await db.query.tutorSettings.findFirst({
      where(fields, operators) {
        return operators.eq(fields.tutorId, user.id)
      },
      columns: { id: true }
    })
    expect(settings).toBeDefined()
  })

  it('rejects invalid email verification tokens', async () => {
    const response = await authClient.auth['verify-email'].confirm.$post({
      json: { token: 'invalid-token' }
    })

    expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED)
  })

  it('returns ok for email verification requests even when user is missing', async () => {
    const response = await authClient.auth['verify-email'].request.$post({
      json: { email: 'missing-verify@example.com' }
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as MessageResponse
    expect(body.message).toMatch(/verification email/i)
  })

  it('rate limits login attempts', async () => {
    const { payload } = await createUserFixture({ email: 'rate-limit-user@example.com' })

    const statuses: number[] = []
    for (let i = 0; i < 6; i += 1) {
      const response = await authClient.auth.login.$post({
        json: {
          email: payload.email,
          password: 'WrongPassword!'
        }
      })
      statuses.push(response.status)
    }

    expect(statuses.slice(0, 5)).toEqual(
      Array.from({ length: 5 }, () => HttpStatusCodes.UNAUTHORIZED)
    )
    expect(statuses[5]).toBe(HttpStatusCodes.TOO_MANY_REQUESTS)
  })
})
