// Purpose: Pin that only admins manage short links, slugs come out clean, and opening counts clicks.
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { analyticsDaily } from '@/db/schemas/analytics-daily.schema'
import { links } from '@/db/schemas/links.schema'
import env from '@/env'
import { waitForPendingCounts } from '@/lib/analytics'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer } from '@/lib/mailer'
import { slugify } from '@/lib/slug'
import { resetRateLimiters } from '@/middlewares/rate-limit'

const tokens: Record<string, string> = {}

async function call(path: string, options: { token?: string, method?: string, body?: unknown } = {}) {
  return app.request(path, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
}

async function add(slug: string, url = 'https://example.test/form') {
  const response = await call('/links', { token: tokens.admin, body: { slug, url } })
  expect(response.status).toBe(201)
  return (await response.json()) as { id: string, slug: string, active: boolean, clicks: number }
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  await seedDevelopmentData()
  resetRateLimiters()
  for (const role of ['admin', 'student']) {
    const login = await call('/auth/login', { body: { email: `${role}@example.test`, password: DEV_PASSWORD } })
    tokens[role] = (await login.json()).accessToken
  }
})

beforeEach(async () => {
  await db.delete(links)
  await db.delete(analyticsDaily).where(eq(analyticsDaily.event, 'link_click'))
})

afterAll(async () => {
  closeMailer()
  await closeDb()
})

describe('slugify', () => {
  it('keeps lowercase letters, digits and single dashes', () => {
    expect(slugify('Iscrizioni 2026/27')).toBe('iscrizioni-2026-27')
    expect(slugify('  Più   Città! ')).toBe('piu-citta')
    expect(slugify('--a__b--')).toBe('a-b')
    expect(slugify('!!!')).toBe('')
  })
})

describe('links', () => {
  it('lets only admins list, add, edit and delete', async () => {
    const { id } = await add('form')
    const body = { slug: 'altro', url: 'https://example.test' }
    expect((await call('/links')).status).toBe(401)
    expect((await call('/links', { token: tokens.student })).status).toBe(403)
    expect((await call('/links', { token: tokens.student, body })).status).toBe(403)
    expect((await call(`/links/${id}`, { token: tokens.student, method: 'PUT', body })).status).toBe(403)
    expect((await call(`/links/${id}`, { token: tokens.student, method: 'DELETE' })).status).toBe(403)
    expect((await call(`/links/${id}`, { method: 'DELETE' })).status).toBe(401)

    const updated = await call(`/links/${id}`, { token: tokens.admin, method: 'PUT', body: { ...body, active: false } })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({ slug: 'altro', active: false })
    expect((await call(`/links/${id}`, { token: tokens.admin, method: 'DELETE' })).status).toBe(204)
    expect((await call(`/links/${id}`, { token: tokens.admin, method: 'DELETE' })).status).toBe(404)
  })

  it('formats the slug, refuses duplicates and anything but https', async () => {
    expect((await add('Iscrizioni 2026')).slug).toBe('iscrizioni-2026')
    expect((await call('/links', { token: tokens.admin, body: { slug: 'ISCRIZIONI 2026', url: 'https://example.test' } })).status).toBe(409)
    for (const url of ['http://example.test', 'javascript:alert(1)', 'ftp://example.test', 'example.test']) {
      expect((await call('/links', { token: tokens.admin, body: { slug: 'x', url } })).status).toBe(422)
    }
    expect((await call('/links', { token: tokens.admin, body: { slug: '???', url: 'https://example.test' } })).status).toBe(422)

    const other = await add('altro')
    const clash = await call(`/links/${other.id}`, { token: tokens.admin, method: 'PUT', body: { slug: 'iscrizioni-2026', url: 'https://example.test' } })
    expect(clash.status).toBe(409)
  })

  it('opens an active link for anyone and counts each click', async () => {
    const link = await add('form', 'https://example.test/form?a=1')
    for (let i = 0; i < 2; i++) {
      const response = await call('/links/open/form', { method: 'POST' })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ url: 'https://example.test/form?a=1' })
    }
    await waitForPendingCounts()
    const [row] = await db.select().from(links).where(eq(links.id, link.id))
    expect(row.clicks).toBe(2)
    const daily = await db.select().from(analyticsDaily).where(and(eq(analyticsDaily.event, 'link_click'), eq(analyticsDaily.detail, link.id)))
    expect(daily.reduce((sum, item) => sum + item.count, 0)).toBe(2)
  })

  it('treats a disabled or unknown link as missing, without counting', async () => {
    const link = await add('form')
    await call(`/links/${link.id}`, { token: tokens.admin, method: 'PUT', body: { slug: 'form', url: 'https://example.test', active: false } })
    expect((await call('/links/open/form', { method: 'POST' })).status).toBe(404)
    expect((await call('/links/open/nessuno', { method: 'POST' })).status).toBe(404)
    expect((await call('/links/open/Non%20Valido', { method: 'POST' })).status).toBe(422)
    const [row] = await db.select().from(links).where(eq(links.id, link.id))
    expect(row.clicks).toBe(0)
  })
})
