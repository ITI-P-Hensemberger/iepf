// Purpose: Subjects routes integration tests.
import { testClient } from 'hono/testing'
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AuthenticatedUser } from '@/lib/types'

import db from '@/db'
import { subjects } from '@/db/schemas/subjects.schema'
import env from '@/env'
import { createAccessToken } from '@/lib/auth'
import { createTestApp } from '@/lib/create-app'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import subjectsRouter from '@/routes/subjects/subjects.index'
import { ensureTestSchema } from '@/tests/test-setup'

if (env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV must be \'test\'')
}

const client = testClient(createTestApp(subjectsRouter)) as any
const subjectsById = (client.subjects as typeof client.subjects & Record<
  ':id',
  typeof client.subjects
>)[':id']

const adminIdentity: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.com',
  role: 'admin'
}

const studentIdentity: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000002',
  email: 'student@example.com',
  role: 'student'
}

let adminToken = ''
let studentToken = ''

interface SubjectResponse {
  id: string
  name: string
  canonicalName: string
  createdAt: string
  updatedAt: string
}

function bearer(token: string) {
  return {
    Authorization: `Bearer ${token}`
  }
}

async function issueToken(user: AuthenticatedUser) {
  const { token } = await createAccessToken(user)
  return token
}

beforeAll(async () => {
  await ensureTestSchema()
  adminToken = await issueToken(adminIdentity)
  studentToken = await issueToken(studentIdentity)
})

beforeEach(async () => {
  await db.delete(subjects)
})

describe('subjects routes', () => {
  it('lists subjects for authenticated users', async () => {
    const response = await client.subjects.$get({
      header: bearer(studentToken)
    })
    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as SubjectResponse[]
    expect(body).toEqual([])
  })

  it('rejects unauthenticated requests', async () => {
    const response = await client.subjects.$get({})
    expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED)
  })

  it('allows admins to create subjects', async () => {
    const response = await client.subjects.$post({
      json: {
        name: 'Mathematics',
        canonicalName: 'mathematics'
      },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
    const body = (await response.json()) as SubjectResponse
    expect(response.headers.get('Location')).toBe(`/subjects/${body.id}`)
    expect(body).toMatchObject({
      name: 'Mathematics',
      canonicalName: 'mathematics'
    })
  })

  it('prevents non-admins from creating subjects', async () => {
    const response = await client.subjects.$post({
      json: {
        name: 'Physics',
        canonicalName: 'physics'
      },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.FORBIDDEN)
  })

  it('rejects duplicate canonical names', async () => {
    await client.subjects.$post({
      json: {
        name: 'Chemistry',
        canonicalName: 'chemistry'
      },
      header: bearer(adminToken)
    })

    const response = await client.subjects.$post({
      json: {
        name: 'Chemistry Advanced',
        canonicalName: 'chemistry'
      },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CONFLICT)
  })

  it('retrieves a subject by id', async () => {
    const createResponse = await client.subjects.$post({
      json: {
        name: 'Biology',
        canonicalName: 'biology'
      },
      header: bearer(adminToken)
    })
    const created = (await createResponse.json()) as SubjectResponse

    const response = await subjectsById.$get({
      param: { id: created.id },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as SubjectResponse
    expect(body).toMatchObject({
      id: created.id,
      name: 'Biology',
      canonicalName: 'biology'
    })
  })

  it('returns 404 for missing subject', async () => {
    const response = await subjectsById.$get({
      param: { id: randomUUID() },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.NOT_FOUND)
    const body = (await response.json()) as { message: string }
    expect(body).toEqual({ message: HttpStatusPhrases.NOT_FOUND })
  })

  it('allows admins to update subjects', async () => {
    const createResponse = await client.subjects.$post({
      json: {
        name: 'History',
        canonicalName: 'history'
      },
      header: bearer(adminToken)
    })
    const created = (await createResponse.json()) as SubjectResponse

    const response = await subjectsById.$patch({
      param: { id: created.id },
      json: { name: 'World History' },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = (await response.json()) as SubjectResponse
    expect(body.name).toBe('World History')
  })

  it('prevents non-admins from updating subjects', async () => {
    const createResponse = await client.subjects.$post({
      json: {
        name: 'Literature',
        canonicalName: 'literature'
      },
      header: bearer(adminToken)
    })
    const created = (await createResponse.json()) as SubjectResponse

    const response = await subjectsById.$patch({
      param: { id: created.id },
      json: { name: 'Modern Literature' },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.FORBIDDEN)
  })

  it('rejects empty subject updates', async () => {
    const createResponse = await client.subjects.$post({
      json: {
        name: 'Art',
        canonicalName: 'art'
      },
      header: bearer(adminToken)
    })
    const created = (await createResponse.json()) as SubjectResponse

    const response = await subjectsById.$patch({
      param: { id: created.id },
      json: {},
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('allows admins to delete subjects', async () => {
    const createResponse = await client.subjects.$post({
      json: {
        name: 'Geography',
        canonicalName: 'geography'
      },
      header: bearer(adminToken)
    })
    const created = (await createResponse.json()) as SubjectResponse

    const response = await subjectsById.$delete({
      param: { id: created.id },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.NO_CONTENT)
  })

  it('prevents non-admins from deleting subjects', async () => {
    const createResponse = await client.subjects.$post({
      json: {
        name: 'Music',
        canonicalName: 'music'
      },
      header: bearer(adminToken)
    })
    const created = (await createResponse.json()) as SubjectResponse

    const response = await subjectsById.$delete({
      param: { id: created.id },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.FORBIDDEN)
  })
})
