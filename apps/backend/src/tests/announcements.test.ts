// Purpose: Pin who sees a popup, when, and what closing it remembers.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { announcementDismissals, announcements } from '@/db/schemas/announcements.schema'
import env from '@/env'
import { cleanUpExpiredData, EXPIRED_POPUP_DISMISSALS_DAYS } from '@/lib/data-retention'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer, waitForPendingMail } from '@/lib/mailer'
import { resetRateLimiters } from '@/middlewares/rate-limit'
import { isAllowedLink } from '@/routes/announcements/announcements.routes'

const DAY = 24 * 60 * 60 * 1000
let ids: Record<string, string>
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

function popup(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Novità',
    body: '**Ciao**, ecco le novità.',
    linkUrl: null,
    linkLabel: null,
    roles: ['student'],
    dismissMode: 'once_account',
    active: true,
    startsAt: null,
    expiresAt: null,
    ...overrides
  }
}

async function create(overrides: Record<string, unknown> = {}) {
  const response = await call('/admin/announcements', { token: tokens.admin, body: popup(overrides) })
  expect(response.status).toBe(201)
  return (await response.json()) as { id: string }
}

async function visibleTitles(token: string) {
  const response = await call('/announcements/active', { token })
  expect(response.status).toBe(200)
  return ((await response.json()) as Array<{ title: string }>).map(item => item.title)
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  resetRateLimiters()
  for (const role of ['admin', 'tutor', 'student', 'activator']) {
    const login = await call('/auth/login', { body: { email: `${role}@example.test`, password: DEV_PASSWORD } })
    tokens[role] = (await login.json()).accessToken
  }
})

beforeEach(async () => {
  await db.delete(announcements)
})

afterAll(async () => {
  await waitForPendingMail()
  closeMailer()
  await closeDb()
})

describe('links', () => {
  it('accept only https and paths inside IEPF', () => {
    expect(isAllowedLink('https://example.com/a')).toBe(true)
    expect(isAllowedLink('/student/book')).toBe(true)
    expect(isAllowedLink('http://example.com')).toBe(false)
    expect(isAllowedLink('javascript:alert(1)')).toBe(false)
    expect(isAllowedLink('//evil.example')).toBe(false)
    expect(isAllowedLink('/\\evil.example')).toBe(false)
  })
})

describe('admin management', () => {
  it('is only for admins', async () => {
    for (const role of ['student', 'tutor', 'activator']) {
      expect((await call('/admin/announcements', { token: tokens[role] })).status).toBe(403)
      expect((await call('/admin/announcements', { token: tokens[role], body: popup() })).status).toBe(403)
    }
    expect((await call('/admin/announcements')).status).toBe(401)
  })

  it('refuses unsafe links, empty audiences and an expiry before the start', async () => {
    const invalid = [
      { linkUrl: 'javascript:alert(1)' },
      { linkUrl: null, linkLabel: 'Apri' },
      { roles: [] },
      { roles: ['activator'] },
      { roles: ['student', 'student'] },
      { title: '   ' },
      { startsAt: '2026-11-10T10:00:00Z', expiresAt: '2026-11-09T10:00:00Z' }
    ]
    for (const overrides of invalid) {
      const response = await call('/admin/announcements', { token: tokens.admin, body: popup(overrides) })
      expect(response.status, JSON.stringify(overrides)).toBe(422)
    }
  })

  it('creates, updates, lists and deletes a popup', async () => {
    const { id } = await create({ linkUrl: 'https://example.com', linkLabel: 'Apri' })
    const update = await call(`/admin/announcements/${id}`, {
      token: tokens.admin,
      method: 'PUT',
      body: popup({ title: 'Cambiato', active: false })
    })
    expect(update.status).toBe(200)
    expect(await update.json()).toMatchObject({ title: 'Cambiato', active: false, linkUrl: null, dismissals: 0 })

    const list = await (await call('/admin/announcements', { token: tokens.admin })).json()
    expect(list).toHaveLength(1)

    expect((await call(`/admin/announcements/${id}`, { token: tokens.admin, method: 'DELETE' })).status).toBe(204)
    expect((await call(`/admin/announcements/${id}`, { token: tokens.admin, method: 'DELETE' })).status).toBe(404)
  })
})

describe('visibility', () => {
  it('reaches only the chosen roles', async () => {
    await create({ title: 'Studenti', roles: ['student'] })
    await create({ title: 'Tutor e admin', roles: ['tutor', 'admin'] })
    expect(await visibleTitles(tokens.student)).toEqual(['Studenti'])
    expect(await visibleTitles(tokens.tutor)).toEqual(['Tutor e admin'])
    expect(await visibleTitles(tokens.admin)).toEqual(['Tutor e admin'])
    expect(await visibleTitles(tokens.activator)).toEqual([])
  })

  it('needs the switch on and the time window open, and no expiry means forever', async () => {
    const now = Date.now()
    await create({ title: 'Spento', active: false })
    await create({ title: 'Futuro', startsAt: new Date(now + DAY).toISOString() })
    await create({ title: 'Scaduto', expiresAt: new Date(now - 1000).toISOString() })
    await create({ title: 'In corso', startsAt: new Date(now - DAY).toISOString(), expiresAt: new Date(now + DAY).toISOString() })
    await create({ title: 'Perenne' })
    expect(await visibleTitles(tokens.student)).toEqual(['In corso', 'Perenne'])
  })
})

describe('dismissal', () => {
  it('hides a once_account popup for good, for that user only', async () => {
    const { id } = await create({ roles: ['student', 'tutor'] })
    expect((await call(`/announcements/${id}/dismiss`, { token: tokens.student, method: 'POST' })).status).toBe(204)
    expect((await call(`/announcements/${id}/dismiss`, { token: tokens.student, method: 'POST' })).status).toBe(204)
    expect(await visibleTitles(tokens.student)).toEqual([])
    expect(await visibleTitles(tokens.tutor)).toEqual(['Novità'])

    const list = await (await call('/admin/announcements', { token: tokens.admin })).json()
    expect(list[0].dismissals).toBe(1)
  })

  it('stores nothing for the modes the browser remembers', async () => {
    const device = await create({ title: 'Device', dismissMode: 'once_device' })
    const session = await create({ title: 'Sessione', dismissMode: 'every_session' })
    for (const { id } of [device, session]) {
      expect((await call(`/announcements/${id}/dismiss`, { token: tokens.student, method: 'POST' })).status).toBe(204)
    }
    expect(await db.select().from(announcementDismissals)).toHaveLength(0)
    expect(await visibleTitles(tokens.student)).toEqual(['Device', 'Sessione'])
  })

  it('stores nothing while an admin impersonates the user', async () => {
    const { id } = await create()
    const impersonation = await call('/admin/impersonate', { token: tokens.admin, body: { userId: ids.student } })
    expect(impersonation.status).toBe(200)
    const { token } = await impersonation.json()
    expect((await call(`/announcements/${id}/dismiss`, { token, method: 'POST' })).status).toBe(204)
    expect(await db.select().from(announcementDismissals)).toHaveLength(0)
    expect(await visibleTitles(tokens.student)).toEqual(['Novità'])
  })

  it('is refused for popups the user cannot see', async () => {
    const { id } = await create({ roles: ['tutor'] })
    expect((await call(`/announcements/${id}/dismiss`, { token: tokens.student, method: 'POST' })).status).toBe(404)
  })
})

describe('retention', () => {
  it('forgets who closed popups expired long ago, never those without expiry', async () => {
    const now = new Date()
    const old = await create({ expiresAt: new Date(now.getTime() - (EXPIRED_POPUP_DISMISSALS_DAYS + 1) * DAY).toISOString() })
    const recent = await create({ expiresAt: new Date(now.getTime() - DAY).toISOString() })
    const forever = await create()
    for (const { id } of [old, recent, forever]) {
      await db.insert(announcementDismissals).values({ announcementId: id, userId: ids.student })
    }
    expect((await cleanUpExpiredData(now)).announcementDismissals).toBe(1)
    expect(await db.select().from(announcementDismissals)).toHaveLength(2)
  })
})
