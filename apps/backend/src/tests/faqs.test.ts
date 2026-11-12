// Purpose: Pin that anyone reads the FAQ in order and only admins change it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { faqs } from '@/db/schemas/faqs.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer } from '@/lib/mailer'
import { resetRateLimiters } from '@/middlewares/rate-limit'

const tokens: Record<string, string> = {}

async function call(path: string, options: { token?: string, method?: string, body?: unknown } = {}) {
  return app.request(path, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(options.token
        ? { Authorization: `Bearer ${options.token}` }
        : {})
    },
    body: options.body
      ? JSON.stringify(options.body)
      : undefined
  })
}

async function questions() {
  const response = await call('/faqs')
  expect(response.status).toBe(200)
  return (await response.json()) as Array<{ id: string, question: string, answer: string, position: number }>
}

async function add(question: string) {
  const response = await call('/faqs', {
    token: tokens.admin,
    body: { question, answer: `Risposta a ${question}` }
  })
  expect(response.status).toBe(201)
  return (await response.json()) as { id: string, position: number }
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  await seedDevelopmentData()
  resetRateLimiters()
  for (const role of ['admin', 'student']) {
    const login = await call('/auth/login', {
      body: { email: `${role}@example.test`, password: DEV_PASSWORD }
    })
    tokens[role] = (await login.json()).accessToken
  }
})

beforeEach(async () => {
  await db.delete(faqs)
})

afterAll(async () => {
  closeMailer()
  await closeDb()
})

describe('faq', () => {
  it('is public and in page order; new questions go last', async () => {
    const first = await add('Prima')
    const second = await add('Seconda')
    expect([first.position, second.position]).toEqual([0, 1])
    expect((await questions()).map(item => item.question)).toEqual(['Prima', 'Seconda'])
  })

  it('lets only admins add, edit, delete and reorder', async () => {
    const { id } = await add('Domanda')
    const body = { question: 'Altra', answer: 'Testo' }
    expect((await call('/faqs', { body })).status).toBe(401)
    expect((await call('/faqs', { token: tokens.student, body })).status).toBe(403)
    expect((await call(`/faqs/${id}`, { token: tokens.student, method: 'PUT', body })).status).toBe(403)
    expect((await call(`/faqs/${id}`, { token: tokens.student, method: 'DELETE' })).status).toBe(403)
    expect((await call('/faqs/order', {
      token: tokens.student,
      method: 'PUT',
      body: {
        ids: [id]
      }
    })).status).toBe(403)

    const updated = await call(`/faqs/${id}`, {
      token: tokens.admin,
      method: 'PUT',
      body: { question: 'Nuova', answer: '**Markdown**' }
    })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({ question: 'Nuova', answer: '**Markdown**' })
  })

  it('reorders the whole list and refuses a stale one', async () => {
    const [a, b, c] = [await add('A'), await add('B'), await add('C')]
    const response = await call('/faqs/order', {
      token: tokens.admin,
      method: 'PUT',
      body: {
        ids: [c.id, a.id, b.id]
      }
    })
    expect(response.status).toBe(200)
    expect((await questions()).map(item => [item.question, item.position])).toEqual([
      ['C', 0],
      ['A', 1],
      ['B', 2]
    ])

    expect((await call('/faqs/order', {
      token: tokens.admin,
      method: 'PUT',
      body: {
        ids: [a.id, b.id]
      }
    })).status).toBe(409)
    expect((await call('/faqs/order', {
      token: tokens.admin,
      method: 'PUT',
      body: {
        ids: [a.id, a.id, b.id]
      }
    })).status).toBe(409)
  })

  it('closes the gap when a question is deleted', async () => {
    const [a, b, c] = [await add('A'), await add('B'), await add('C')]
    expect((await call(`/faqs/${b.id}`, { token: tokens.admin, method: 'DELETE' })).status).toBe(204)
    expect((await questions()).map(item => [item.id, item.position])).toEqual([
      [a.id, 0],
      [c.id, 1]
    ])
    expect((await call(`/faqs/${b.id}`, { token: tokens.admin, method: 'DELETE' })).status).toBe(404)
  })
})
