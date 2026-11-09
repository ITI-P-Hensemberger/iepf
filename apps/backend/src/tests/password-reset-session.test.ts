// Purpose: Pin the password reset link for a signed-in user: whose link it is, and which sessions survive.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import app from '@/app'
import { closeDb } from '@/db'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { issuePasswordResetToken } from '@/lib/password-reset'
import { resetRateLimiters } from '@/middlewares/rate-limit'

vi.mock('@/lib/mailer', () => ({
  sendMail: async () => {},
  closeMailer: () => {},
  waitForPendingMail: async () => {}
}))

let ids: Record<string, string>

async function call(path: string, body: unknown, accessToken?: string) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body)
  })
}

async function login(email: string, password = DEV_PASSWORD) {
  const response = await call('/auth/login', { email, password })
  return { status: response.status, body: response.status === 200 ? await response.json() as { accessToken: string, refreshToken: string } : null }
}

async function check(token: string, accessToken?: string) {
  return (await call('/auth/password/reset/check', { token }, accessToken)).json() as Promise<{ valid: boolean, sameUser: boolean }>
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  resetRateLimiters()
})

afterAll(async () => {
  await closeDb()
})

describe('login', () => {
  it('refuses an unknown email', async () => {
    expect((await login('nessuno@example.test')).status).toBe(401)
  })
})

describe('password reset while signed in', () => {
  it('tells whether the link belongs to the signed-in user, without using it up', async () => {
    const { token } = await issuePasswordResetToken(ids.student)
    const student = (await login('student@example.test')).body!
    const tutor = (await login('tutor@example.test')).body!

    expect(await check(token)).toEqual({ valid: true, sameUser: false })
    expect(await check(token, student.accessToken)).toEqual({ valid: true, sameUser: true })
    expect(await check(token, tutor.accessToken)).toEqual({ valid: true, sameUser: false })
    expect(await check(token, 'not-a-jwt')).toEqual({ valid: true, sameUser: false })
    expect(await check('unknown-token', student.accessToken)).toEqual({ valid: false, sameUser: false })
  })

  it('keeps the session the change was made from and signs out the others', async () => {
    const here = (await login('student@example.test')).body!
    const elsewhere = (await login('student@example.test')).body!
    const { token } = await issuePasswordResetToken(ids.student)

    const confirmed = await call('/auth/password/reset/confirm', { token, password: 'NuovaPassword1!', keepRefreshToken: here.refreshToken })
    expect(confirmed.status).toBe(200)

    expect((await call('/auth/refresh', { refreshToken: here.refreshToken })).status).toBe(200)
    expect((await call('/auth/refresh', { refreshToken: elsewhere.refreshToken })).status).toBe(401)
    expect((await login('student@example.test', 'NuovaPassword1!')).status).toBe(200)
    // The link works once.
    expect(await check(token)).toEqual({ valid: false, sameUser: false })
  })

  it('lets only one of two simultaneous confirmations use the link', async () => {
    const { token } = await issuePasswordResetToken(ids.activator)
    const statuses = (await Promise.all([
      call('/auth/password/reset/confirm', { token, password: 'PrimaPassword1!' }),
      call('/auth/password/reset/confirm', { token, password: 'SecondaPassword1!' })
    ])).map(response => response.status)
    expect(statuses.filter(status => status === 200)).toHaveLength(1)
  })

  it('cannot spare a session of another user', async () => {
    const tutor = (await login('tutor@example.test')).body!
    const tutorElsewhere = (await login('tutor@example.test')).body!
    const student = (await login('student@example.test', 'NuovaPassword1!')).body!
    const { token } = await issuePasswordResetToken(ids.tutor)

    // A refresh token of someone else keeps nothing: every session of the tutor ends.
    await call('/auth/password/reset/confirm', { token, password: 'AltraPassword1!', keepRefreshToken: student.refreshToken })
    expect((await call('/auth/refresh', { refreshToken: tutor.refreshToken })).status).toBe(401)
    expect((await call('/auth/refresh', { refreshToken: tutorElsewhere.refreshToken })).status).toBe(401)
    expect((await call('/auth/refresh', { refreshToken: student.refreshToken })).status).toBe(200)
  })
})
