// Purpose: Exercise real PostgreSQL migrations, local demo data, auth and SMTP.
/* eslint-disable node/no-process-env */
import { sql } from 'drizzle-orm'
import { Buffer } from 'node:buffer'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, DEV_ROLES, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer, sendMail } from '@/lib/mailer'

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

  it('serves public API documentation', async () => {
    expect((await app.request('/doc')).status).toBe(200)
  })

  it('rejects invalid credentials', async () => {
    expect((await post('/auth/login', { email: 'student@example.test', password: 'wrong' })).status).toBe(401)
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
})
