// Purpose: Class sections routes integration tests.
import { testClient } from 'hono/testing'
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AuthenticatedUser } from '@/lib/types'

import db from '@/db'
import { classSections } from '@/db/schemas/class-sections.schema'
import env from '@/env'
import { createAccessToken } from '@/lib/auth'
import { createTestApp } from '@/lib/create-app'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import classSectionsRouter from '@/routes/class-sections/class-sections.index'
import { ensureTestSchema } from '@/tests/test-setup'

if (env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV must be \'test\'')
}

const client = testClient(createTestApp(classSectionsRouter)) as any
const classSectionsById = (client['class-sections'] as typeof client['class-sections'] & Record<
  ':id',
  typeof client['class-sections']
>)[':id']

const adminIdentity: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.com',
  role: 'admin'
}

let adminToken = ''

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
})

beforeEach(async () => {
  await db.delete(classSections)
})

describe('class sections routes', () => {
  it('allows admins to create class sections', async () => {
    const response = await client['class-sections'].$post({
      json: { name: 'D1' },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
    const body = await response.json() as { id: string }
    expect(response.headers.get('Location')).toBe(`/class-sections/${body.id}`)
  })

  it('rejects duplicate class section names', async () => {
    await client['class-sections'].$post({
      json: { name: 'B1' },
      header: bearer(adminToken)
    })

    const response = await client['class-sections'].$post({
      json: { name: 'B1' },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CONFLICT)
  })

  it('lists class sections for admins', async () => {
    await client['class-sections'].$post({
      json: { name: 'BA' },
      header: bearer(adminToken)
    })

    const response = await client['class-sections'].$get({
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as Array<{ name: string }>
    expect(body.map(row => row.name)).toContain('BA')
  })

  it('allows public listing of class sections', async () => {
    const response = await client['class-sections'].$get({})

    expect(response.status).toBe(HttpStatusCodes.OK)
  })

  it('updates class sections', async () => {
    const createResponse = await client['class-sections'].$post({
      json: { name: 'D2' },
      header: bearer(adminToken)
    })
    const created = await createResponse.json() as { id: string }

    const response = await classSectionsById.$patch({
      param: { id: created.id },
      json: { name: 'D2-updated' },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
  })

  it('returns 404 for missing class sections', async () => {
    const response = await classSectionsById.$get({
      param: { id: randomUUID() },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.NOT_FOUND)
    const body = await response.json() as { message: string }
    expect(body.message).toBe(HttpStatusPhrases.NOT_FOUND)
  })

  it('deletes class sections', async () => {
    const createResponse = await client['class-sections'].$post({
      json: { name: 'C1' },
      header: bearer(adminToken)
    })
    const created = await createResponse.json() as { id: string }

    const response = await classSectionsById.$delete({
      param: { id: created.id },
      header: bearer(adminToken)
    })
    expect(response.status).toBe(HttpStatusCodes.NO_CONTENT)
  })
})
