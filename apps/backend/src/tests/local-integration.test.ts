// Purpose: Exercise real PostgreSQL migrations, local demo data, auth and SMTP.
/* eslint-disable node/no-process-env */
import { eq, sql } from 'drizzle-orm'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { refreshTokens } from '@/db/schemas/refresh-tokens.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, DEV_ROLES, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer, sendMail } from '@/lib/mailer'
import { MOCK_PASSWORD } from '@/lib/mock-data'
import { verifyPassword } from '@/lib/password'
import { ROTATION_GRACE_MS } from '@/lib/refresh-tokens'
import { hashToken } from '@/lib/token-utils'

let ids: Record<string, string>
let refreshToken: string

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  if (new URL(env.DATABASE_URL).pathname !== '/iepf_test') {
    throw new Error('Integration tests require the isolated iepf_test database')
  }
  await cleanDatabase()
  ids = await seedDevelopmentData()
})

afterAll(async () => {
  closeMailer()
  await closeDb()
})

describe('local environment', () => {
  it('refuses production and non-local seed targets', () => {
    expect(() => assertLocalDatabase('postgresql://user:pass@db:5432/iepf_dev', 'development')).toThrow()
    expect(() => assertLocalDatabase('postgresql://user:pass@localhost/production', 'development')).toThrow()
    expect(() => assertLocalDatabase('postgresql://user:pass@localhost/iepf_dev', 'production')).toThrow()
  })

  it('has applied SQL migrations, including the latest weekday enum', async () => {
    const journal = await db.execute(sql`select count(*)::int as count from drizzle.__drizzle_migrations`)
    expect(journal.rows[0].count).toBeGreaterThan(0)
    const result = await db.execute(sql`select enumlabel from pg_enum join pg_type on pg_type.oid = enumtypid where typname = 'weekday_start_time'`)
    expect(result.rows.map(row => row.enumlabel)).toContain('14:00-16:00')
  })

  it('can rerun the seed without duplicating or overwriting developer data', async () => {
    await db.execute(sql`update users set first_name = 'Edited locally' where id = ${ids.student}`)
    const repeated = await seedDevelopmentData()
    expect(repeated).toEqual(ids)
    const count = await db.execute(sql`select (select count(*)::int from users) as users, (select count(*)::int from lessons) as lessons, (select count(*)::int from lesson_bookings) as bookings, (select count(*)::int from token_ledger) as grants`)
    expect(count.rows[0]).toEqual({ users: 4, lessons: 2, bookings: 1, grants: 2 })
    const student = await db.query.users.findFirst({ where: (fields, ops) => ops.eq(fields.id, ids.student) })
    expect(student?.firstName).toBe('Edited locally')
  })

  it('gives database statements a timeout', async () => {
    const result = await db.execute(sql`show statement_timeout`)
    expect(result.rows[0].statement_timeout).toBe('30s')
  })

  it('serves public API documentation', async () => {
    expect((await app.request('/doc')).status).toBe(200)
  })

  it('rejects invalid credentials', async () => {
    expect((await post('/auth/login', { email: 'student@example.test', password: 'wrong' })).status).toBe(401)
  })

  it('lets parallel refreshes of one token all succeed with distinct tokens', async () => {
    const login = await post('/auth/login', { email: 'student@example.test', password: DEV_PASSWORD })
    const { refreshToken: token } = await login.json()
    const responses = await Promise.all(Array.from({ length: 5 }, () => post('/auth/refresh', { refreshToken: token })))
    expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200, 200])
    const bodies = await Promise.all(responses.map(response => response.json()))
    const issued = bodies.map(body => body.refreshToken as string)
    expect(new Set(issued).size).toBe(5)
    expect((await post('/auth/refresh', { refreshToken: issued[0] })).status).toBe(200)
  })

  it('removes rotated tokens once their grace period has ended', async () => {
    const login = await post('/auth/login', { email: 'student@example.test', password: DEV_PASSWORD })
    const { refreshToken: first } = await login.json()
    const { refreshToken: second } = await (await post('/auth/refresh', { refreshToken: first })).json()
    await db.update(refreshTokens)
      .set({ rotatedAt: new Date(Date.now() - ROTATION_GRACE_MS) })
      .where(eq(refreshTokens.tokenHash, hashToken(first)))
    expect((await post('/auth/refresh', { refreshToken: second })).status).toBe(200)
    expect(await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, hashToken(first)) })).toBeUndefined()
  })

  it('authenticates all four demo roles and issues usable refresh tokens', async () => {
    for (const role of DEV_ROLES) {
      const response = await post('/auth/login', { email: `${role}@example.test`, password: DEV_PASSWORD })
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.accessToken).toBeTypeOf('string')
      expect(body.refreshToken).toBeTypeOf('string')
      const payload = JSON.parse(Buffer.from(body.accessToken.split('.')[1], 'base64url').toString())
      expect(payload.role).toBe(role)
      refreshToken = body.refreshToken
    }
    const response = await post('/auth/refresh', { refreshToken })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.refreshToken).not.toBe(refreshToken)
    // Within the grace period the old token still works, so a lost response is harmless.
    const retried = await post('/auth/refresh', { refreshToken })
    expect(retried.status).toBe(200)
    expect((await retried.json()).refreshToken).not.toBe(body.refreshToken)
    await db.update(refreshTokens)
      .set({ rotatedAt: new Date(Date.now() - ROTATION_GRACE_MS) })
      .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)))
    expect((await post('/auth/refresh', { refreshToken })).status).toBe(401)
  })

  it('delivers HTML email to Mailpit without external SMTP', async () => {
    const base = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'
    const parsed = new URL(base)
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || !['localhost', '127.0.0.1'].includes(env.SMTP_HOST ?? '')) {
      throw new Error('Email integration tests require local Mailpit')
    }
    const subject = `IEPF-test-${crypto.randomUUID()}`
    await sendMail({ to: 'student@example.test', subject, text: 'Local email', html: '<strong>Local email</strong>' })
    const response = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`subject:${subject}`)}`)
    expect(response.ok).toBe(true)
    const result = await response.json()
    expect(result.messages).toHaveLength(1)
    const message = await fetch(`${base}/api/v1/message/${result.messages[0].ID}`).then(r => r.json())
    expect(message.HTML).toContain('<strong>Local email</strong>')
    expect(message.To[0].Address).toBe('student@example.test')
  })

  it('runs the complete mock pipeline with fictional addresses, settings and Mailpit', async () => {
    const base = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025'
    const search = `${base}/api/v1/search?query=${encodeURIComponent('to:mock.tutor-active-01@example.test')}`
    const before = await fetch(search).then(r => r.json())
    const previous = new Set(before.messages.map((message: { ID: string }) => message.ID))
    const require = createRequire(import.meta.url)
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'src/scripts/seed-full.ts'], {
      env: process.env,
      encoding: 'utf8',
      timeout: 90000
    })
    expect(result.status, result.stderr || result.stdout).toBe(0)
    const counts = await db.execute(sql`select
      (select count(*)::int from users where email like 'mock.%@example.test') as users,
      (select count(*)::int from tutor_invite_tokens where email like 'mock.%@example.test') as tutor_invites,
      (select count(*)::int from admin_invite_tokens where email like 'mock.%@example.test') as admin_invites,
      (select count(*)::int from global_settings) as settings,
      (select count(*)::int from lessons where generated_by_job = true) as generated_lessons,
      (select count(*)::int from lesson_feedback) as feedback`)
    expect(counts.rows[0].users).toBe(97)
    expect(counts.rows[0].tutor_invites).toBe(10)
    expect(counts.rows[0].admin_invites).toBe(1)
    expect(counts.rows[0].settings).toBe(3)
    expect(counts.rows[0].generated_lessons).toBeGreaterThan(0)
    expect(counts.rows[0].feedback).toBeGreaterThan(0)
    const student = await db.query.users.findFirst({ where: (fields, ops) => ops.eq(fields.email, 'mock.student-active-01@example.test') })
    expect(student).toBeDefined()
    expect(await verifyPassword(student!.passwordHash, MOCK_PASSWORD)).toBe(true)
    // Existing demo/custom data must not become input to the full mock booking job.
    const original = await db.execute(sql`select count(*)::int as count from lesson_bookings where student_id = ${ids.student}`)
    expect(original.rows[0].count).toBe(1)
    const messages = await fetch(search).then(r => r.json())
    expect(messages.messages.some((message: { ID: string }) => !previous.has(message.ID))).toBe(true)
  })
})
