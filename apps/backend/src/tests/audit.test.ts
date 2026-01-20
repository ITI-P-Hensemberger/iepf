// Purpose: Audit log route integration tests.
import { testClient } from 'hono/testing'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AuthenticatedUser } from '@/lib/types'

import db from '@/db'
import { auditLogs } from '@/db/schemas/audit-logs.schema'
import { subjects } from '@/db/schemas/subjects.schema'
import env from '@/env'
import { createAccessToken } from '@/lib/auth'
import { createTestApp } from '@/lib/create-app'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import auditRouter from '@/routes/audit/audit.index'
import subjectsRouter from '@/routes/subjects/subjects.index'
import { seedAdminUser } from '@/tests/test-helpers'
import { ensureTestSchema } from '@/tests/test-setup'

if (env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV must be \'test\'')
}

const auditClient = testClient(createTestApp(auditRouter)) as any
const subjectsClient = testClient(createTestApp(subjectsRouter)) as any
const auditById = (auditClient.audit.logs as typeof auditClient.audit.logs & Record<
  ':id',
  typeof auditClient.audit.logs
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
  await seedAdminUser(adminIdentity.id, adminIdentity.email)
  adminToken = await issueToken(adminIdentity)
  studentToken = await issueToken(studentIdentity)
})

beforeEach(async () => {
  await db.delete(auditLogs)
  await db.delete(subjects)
})

describe('audit routes', () => {
  it('records audit logs for subject creation', async () => {
    const subjectResponse = await subjectsClient.subjects.$post({
      json: {
        name: 'History',
        canonicalName: 'history'
      },
      header: bearer(adminToken)
    })
    expect(subjectResponse.status).toBe(HttpStatusCodes.CREATED)

    const listResponse = await auditClient.audit.logs.$get({
      query: {
        action: 'POST /subjects'
      },
      header: bearer(adminToken)
    })

    expect(listResponse.status).toBe(HttpStatusCodes.OK)
    const list = await listResponse.json() as { data: Array<{
      id: string
      actorId: string | null
      method: string
      path: string
      status: number
    }> }

    const entry = list.data.find(row => row.path === '/subjects')
    expect(entry?.actorId).toBe(adminIdentity.id)
    expect(entry?.method).toBe('POST')
    expect(entry?.status).toBe(HttpStatusCodes.CREATED)

    const detailResponse = await auditById.$get({
      param: { id: entry!.id },
      header: bearer(adminToken)
    })

    expect(detailResponse.status).toBe(HttpStatusCodes.OK)
  })

  it('prevents non-admins from listing audit logs', async () => {
    const response = await auditClient.audit.logs.$get({
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.FORBIDDEN)
  })
})
