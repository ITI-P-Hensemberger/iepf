// Purpose: Pin that a subject's canonical name comes from its name and that names never repeat.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '@/app'
import { closeDb } from '@/db'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer } from '@/lib/mailer'
import { canonicalSubjectName } from '@/lib/subject-name'
import { resetRateLimiters } from '@/middlewares/rate-limit'

let token: string

async function call(path: string, method: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  })
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  await seedDevelopmentData()
  resetRateLimiters()
  const login = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password: DEV_PASSWORD })
  })
  token = (await login.json()).accessToken
})

afterAll(async () => {
  closeMailer()
  await closeDb()
})

describe('subject names', () => {
  it('makes the canonical name from the name', () => {
    expect(canonicalSubjectName('Inglese - Lingua')).toBe('inglese_lingua')
    expect(canonicalSubjectName('STA - Meccanica e Meccatronica')).toBe('sta_meccanica_e_meccatronica')
    expect(canonicalSubjectName('  Educazione Fisica ')).toBe('educazione_fisica')
    expect(canonicalSubjectName('Lingua e letteratura italiana')).toBe('lingua_e_letteratura_italiana')
    expect(canonicalSubjectName('Più matematica!')).toBe('piu_matematica')
  })

  it('creates and renames with the canonical name made by the server', async () => {
    const created = await call('/subjects', 'POST', { name: 'Arte e immagine' })
    expect(created.status).toBe(201)
    const subject = await created.json()
    expect(subject.canonicalName).toBe('arte_e_immagine')

    const renamed = await call(`/subjects/${subject.id}`, 'PATCH', { name: 'Arte e territorio' })
    expect(renamed.status).toBe(200)
    expect((await renamed.json()).canonicalName).toBe('arte_e_territorio')

    expect((await call('/subjects', 'POST', { name: 'Musica', canonicalName: 'music' })).status).toBe(422)
  })

  it('refuses a name that repeats another one', async () => {
    const first = await (await call('/subjects', 'POST', { name: 'Educazione civica' })).json()
    const other = await (await call('/subjects', 'POST', { name: 'Filosofia antica' })).json()

    expect((await call('/subjects', 'POST', { name: 'educazione civica' })).status).toBe(409)
    expect((await call('/subjects', 'POST', { name: 'Educazione - Civica' })).status).toBe(409)
    expect((await call(`/subjects/${other.id}`, 'PATCH', { name: 'EDUCAZIONE CIVICA' })).status).toBe(409)
    // Renaming a subject to its own name, in other letters, is fine.
    expect((await call(`/subjects/${first.id}`, 'PATCH', { name: 'Educazione Civica' })).status).toBe(200)
  })
})
