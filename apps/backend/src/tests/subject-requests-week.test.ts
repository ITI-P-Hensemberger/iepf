// Purpose: Pin what the tutor home shows of this week's subject requests: only this week, most
// requested first, no counts, and not to students.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '@/app'
import db, { closeDb } from '@/db'
import { subjectRequests } from '@/db/schemas/subject-requests.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { cleanDatabase } from '@/lib/db-cleanup'
import { DEV_PASSWORD, seedDevelopmentData } from '@/lib/dev-seed'
import { assertLocalDatabase } from '@/lib/local-database'
import { closeMailer } from '@/lib/mailer'
import { resetRateLimiters } from '@/middlewares/rate-limit'

async function login(email: string) {
  const response = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEV_PASSWORD })
  })
  return (await response.json()).accessToken as string
}

function week(token: string) {
  return app.request('/subject-requests/week', {
    headers: { Authorization: `Bearer ${token}` }
  })
}

beforeAll(async () => {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  await cleanDatabase()
  await seedDevelopmentData()
  resetRateLimiters()
})

afterAll(async () => {
  closeMailer()
  await closeDb()
})

describe('subjects requested this week', () => {
  it('lists this week\'s subjects by demand, without counts, for tutors only', async () => {
    const [student, other] = await db.insert(users).values([
      {
        email: 'week-a@example.test',
        firstName: 'A',
        lastName: 'A',
        passwordHash: 'x',
        role: 'student'
      },
      {
        email: 'week-b@example.test',
        firstName: 'B',
        lastName: 'B',
        passwordHash: 'x',
        role: 'student'
      }
    ]).returning()
    const [rare, popular, old] = await db.insert(subjects).values([
      { name: 'Arte rara', canonicalName: 'arte_rara' },
      { name: 'Zoologia richiesta', canonicalName: 'zoologia_richiesta' },
      { name: 'Storia vecchia', canonicalName: 'storia_vecchia' }
    ]).returning()
    const now = new Date()
    await db.insert(subjectRequests).values([
      { studentId: student.id, subjectId: rare.id, createdAt: now },
      { studentId: student.id, subjectId: popular.id, createdAt: now },
      { studentId: other.id, subjectId: popular.id, createdAt: now },
      {
        studentId: student.id,
        subjectId: old.id,
        createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)
      }
    ])

    const response = await week(await login('tutor@example.test'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { subjectId: popular.id, subjectName: 'Zoologia richiesta' },
      { subjectId: rare.id, subjectName: 'Arte rara' }
    ])

    expect((await week(await login('student@example.test'))).status).toBe(403)
  })
})
