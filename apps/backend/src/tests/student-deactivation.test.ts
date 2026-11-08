// Purpose: Pin how a deactivated student differs from one never activated, the optional reason
// sent with it, and that only admins can turn a student off.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import app from '@/app'
import { closeDb } from '@/db'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
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
    expect(sent[0].text).toContain('\n\nMotivo: Pagamento <non> ricevuto.\n\n')
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
})
