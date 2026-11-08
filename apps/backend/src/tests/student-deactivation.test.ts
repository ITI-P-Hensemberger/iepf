// Purpose: Pin how a deactivated student differs from one never activated, the optional reason
// sent with it, the history of activations, and what activators may do: only first activations.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { classSections } from '@/db/schemas/class-sections.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { issueTutorInviteToken } from '@/lib/tutor-invite'
import { resetRateLimiters } from '@/middlewares/rate-limit'

const sent = vi.hoisted(() => [] as Array<{ text: string, html: string }>)
vi.mock('@/lib/mailer', () => ({
  sendMail: async (mail: { text: string, html: string }) => { sent.push(mail) },
  closeMailer: () => {},
  waitForPendingMail: async () => {}
}))

let ids: Record<string, string>
const tokens: Record<string, string> = {}

async function call(path: string, options: { token: string, method?: string, body?: unknown }) {
  return app.request(path, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${options.token}` },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
}

const studentState = async () => (await call(`/users/${ids.student}`, { token: tokens.admin })).json()

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  ids = await seedDevelopmentData()
  resetRateLimiters()
  for (const role of ['admin', 'activator']) {
    const login = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${role}@example.test`, password: DEV_PASSWORD })
    })
    tokens[role] = (await login.json()).accessToken
  }
})

beforeEach(() => {
  sent.length = 0
})

afterAll(async () => {
  await closeDb()
})

describe('student deactivation', () => {
  it('is not open to activators, who can still activate', async () => {
    const off = await call(`/users/${ids.student}`, { token: tokens.activator, method: 'PATCH', body: { isActive: false } })
    expect(off.status).toBe(403)
    const on = await call(`/users/${ids.student}`, { token: tokens.activator, method: 'PATCH', body: { isActive: true } })
    expect(on.status).toBe(200)
  })

  it('records when and why an active student was turned off, and sends the reason escaped', async () => {
    const response = await call(`/users/${ids.student}`, {
      token: tokens.admin,
      method: 'PATCH',
      body: { isActive: false, deactivationReason: ' Pagamento <non> ricevuto. ' }
    })
    expect(response.status).toBe(200)
    const student = await studentState()
    expect(student.isActive).toBe(false)
    expect(student.deactivatedAt).not.toBeNull()
    expect(student.deactivationReason).toBe('Pagamento <non> ricevuto.')
    expect(sent[0].text).toContain('\n\nMotivo\nPagamento <non> ricevuto.\n\n')
    expect(sent[0].html).toContain('Pagamento &lt;non&gt; ricevuto.')
  })

  it('clears both when the student is active again', async () => {
    await call(`/users/${ids.student}`, { token: tokens.admin, method: 'PATCH', body: { isActive: true } })
    const student = await studentState()
    expect(student.deactivatedAt).toBeNull()
    expect(student.deactivationReason).toBeNull()
  })

  it('works without a reason', async () => {
    await call(`/users/${ids.student}`, { token: tokens.admin, method: 'PATCH', body: { isActive: false } })
    const student = await studentState()
    expect(student.deactivatedAt).not.toBeNull()
    expect(student.deactivationReason).toBeNull()
    expect(sent[0].text).not.toContain('Motivo')
  })

  it('lists pending and deactivated students apart', async () => {
    const list = async (deactivated: boolean) =>
      ((await (await call(`/users?role=student&isActive=false&deactivated=${deactivated}&limit=200`, { token: tokens.admin })).json()).data as Array<{ id: string }>).map(user => user.id)
    expect(await list(true)).toContain(ids.student)
    expect(await list(false)).not.toContain(ids.student)
  })

  it('hides deactivated students from activators, who cannot reactivate them', async () => {
    const listed = await (await call('/users?role=student&isActive=false&limit=200', { token: tokens.activator })).json()
    expect((listed.data as Array<{ id: string }>).map(user => user.id)).not.toContain(ids.student)
    expect((await call(`/users/${ids.student}`, { token: tokens.activator })).status).toBe(403)
    expect((await call(`/users/${ids.student}`, { token: tokens.activator, method: 'PATCH', body: { isActive: true } })).status).toBe(403)
  })

  it('keeps a history of who turned the account on and off', async () => {
    expect((await call(`/users/${ids.student}`, { token: tokens.admin, method: 'PATCH', body: { isActive: true } })).status).toBe(200)
    const history = await (await call(`/users/${ids.student}/activation-history`, { token: tokens.admin })).json()
    expect(history.map((event: { kind: string }) => event.kind)).toEqual(['deactivated', 'reactivated', 'deactivated', 'reactivated'])
    expect(history[0]).toMatchObject({ reason: 'Pagamento <non> ricevuto.', actorRole: 'admin' })
    expect(history[2].reason).toBeNull()
    expect((await call(`/users/${ids.student}/activation-history`, { token: tokens.activator })).status).toBe(403)
  })

  it('lets activators turn on a student never activated, recorded as the first activation', async () => {
    const [pending] = await db.insert(users).values({ email: 'nuovo@example.test', firstName: 'Nuovo', lastName: 'Studente', passwordHash: 'x', role: 'student', emailVerifiedAt: new Date() }).returning({ id: users.id })
    await db.insert(studentProfiles).values({ userId: pending.id, isActive: false })
    expect((await call(`/users/${pending.id}`, { token: tokens.activator, method: 'PATCH', body: { isActive: true } })).status).toBe(200)
    const history = await (await call(`/users/${pending.id}/activation-history`, { token: tokens.admin })).json()
    expect(history).toMatchObject([{ kind: 'activated', actorRole: 'activator' }])
  })

  it('records a tutor as activated by whoever sent the invite', async () => {
    const email = `tutor-${crypto.randomUUID()}@hensemberger.it`
    const { token } = await issueTutorInviteToken(email, ids.admin)
    const [section] = await db.select({ id: classSections.id }).from(classSections).limit(1)
    const confirmed = await app.request('/auth/tutor-invite/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, firstName: 'Nuovo', lastName: 'Tutor', password: 'Integrity123!', year: 4, sectionId: section.id })
    })
    expect(confirmed.status).toBe(201)
    const history = await (await call(`/users/${(await confirmed.json()).id}/activation-history`, { token: tokens.admin })).json()
    expect(history).toMatchObject([{ kind: 'activated', actorRole: 'admin' }])
  })
})
