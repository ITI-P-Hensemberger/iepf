// Purpose: Pin what a session alone cannot do: change the password or email of its own account,
// or turn an impersonation into another admin's session.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { resetRateLimiters } from '@/middlewares/rate-limit'

vi.mock('@/lib/mailer', () => ({
  sendMail: async () => {},
  closeMailer: () => {},
  waitForPendingMail: async () => {}
}))

let ids: Record<string, string>
let otherAdminId: string
const tokens: Record<string, string> = {}

async function call(path: string, options: { token: string, method?: string, body?: unknown }) {
  return app.request(path, {
    method: options.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${options.token}` },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  const [other] = await db.insert(users).values({ email: 'admin2@example.test', firstName: 'Altro', lastName: 'Admin', passwordHash: 'x', role: 'admin', emailVerifiedAt: new Date() }).returning({ id: users.id })
  otherAdminId = other.id
  await db.insert(adminProfiles).values({ userId: otherAdminId, isActive: true })
  resetRateLimiters()
  for (const role of ['admin', 'tutor', 'student']) {
    const login = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${role}@example.test`, password: DEV_PASSWORD })
    })
    tokens[role] = (await login.json()).accessToken
  }
})

afterAll(async () => {
  await closeDb()
})

describe('own profile', () => {
  it('takes no password at all', async () => {
    const response = await call(`/users/${ids.student}`, { token: tokens.student, method: 'PATCH', body: { password: 'NuovaPassword1!' } })
    expect(response.status).toBe(422)
  })

  it('lets students and tutors change their name but not their email', async () => {
    for (const role of ['student', 'tutor']) {
      const email = await call(`/users/${ids[role]}`, { token: tokens[role], method: 'PATCH', body: { email: `nuovo-${role}@hensemberger.it` } })
      expect(email.status).toBe(403)
      const name = await call(`/users/${ids[role]}`, { token: tokens[role], method: 'PATCH', body: { firstName: 'Nuovo' } })
      expect(name.status).toBe(200)
    }
  })
})

describe('deleting accounts', () => {
  it('refuses an admin deleting their own account', async () => {
    const response = await call(`/users/${ids.admin}`, { token: tokens.admin, method: 'DELETE', body: { password: DEV_PASSWORD } })
    expect(response.status).toBe(403)
    expect(await db.query.users.findFirst({ where: eq(users.id, ids.admin), columns: { id: true } })).toBeDefined()
  })
})

describe('impersonation', () => {
  it('reaches students and tutors only', async () => {
    for (const userId of [ids.student, ids.tutor]) {
      expect((await call('/admin/impersonate', { token: tokens.admin, body: { userId } })).status).toBe(200)
    }
    for (const userId of [otherAdminId, ids.activator]) {
      expect((await call('/admin/impersonate', { token: tokens.admin, body: { userId } })).status).toBe(403)
    }
  })

  it('cannot start a second one from inside the first', async () => {
    const first = await (await call('/admin/impersonate', { token: tokens.admin, body: { userId: ids.tutor } })).json()
    expect((await call('/admin/impersonate', { token: first.token, body: { userId: ids.student } })).status).toBe(403)
  })
})
