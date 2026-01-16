// Purpose: Tutor-subject relationship API tests.
import { testClient } from 'hono/testing'
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AuthenticatedUser } from '@/lib/types'

import db from '@/db'
import { subjects } from '@/db/schemas/subjects.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { createAccessToken } from '@/lib/auth'
import { createTestApp } from '@/lib/create-app'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import tutorSubjectsRouter from '@/routes/tutor-subjects/tutor-subjects.index'
import { ensureTestSchema } from '@/tests/test-setup'

if (env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV must be \'test\'')
}

const client = testClient(createTestApp(tutorSubjectsRouter)) as any
const tutorSubjectsByTutor = (client.tutors as typeof client.tutors & Record<
  ':tutorId',
  typeof client.tutors
>)[':tutorId']
const subjectsById = (client.subjects as typeof client.subjects & Record<
  ':subjectId',
  typeof client.subjects
>)[':subjectId']

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

async function issueToken(user: AuthenticatedUser) {
  const { token } = await createAccessToken(user)
  return token
}

function bearer(token: string) {
  return {
    Authorization: `Bearer ${token}`
  }
}

async function createTutor() {
  const [user] = await db.insert(users).values({
    email: `tutor-${randomUUID()}@example.com`,
    firstName: 'Tutor',
    lastName: 'Example',
    passwordHash: 'hash',
    role: 'tutor',
    emailVerifiedAt: new Date()
  }).returning({
    id: users.id
  })
  return user
}

async function createSubject() {
  const [subject] = await db.insert(subjects).values({
    name: 'Geometry',
    canonicalName: `geometry-${randomUUID()}`
  }).returning({
    id: subjects.id
  })
  return subject
}

beforeAll(async () => {
  await ensureTestSchema()
})

beforeEach(async () => {
  await db.delete(tutorSubjects)
  await db.delete(subjects)
  await db.delete(users)
})

describe('tutor-subject routes', () => {
  it('allows tutors to add subjects to themselves', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()
    const tutorToken = await issueToken({
      id: tutor.id,
      email: 'tutor@example.com',
      role: 'tutor'
    })

    const response = await tutorSubjectsByTutor.subjects.$post({
      param: { tutorId: tutor.id },
      json: { subjectId: subject.id },
      header: bearer(tutorToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
  })

  it('prevents students from adding subjects to themselves', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()
    const studentToken = await issueToken(studentIdentity)

    const response = await tutorSubjectsByTutor.subjects.$post({
      param: { tutorId: tutor.id },
      json: { subjectId: subject.id },
      header: bearer(studentToken)
    })

    expect(response.status).toBe(HttpStatusCodes.FORBIDDEN)
  })

  it('allows admins to add subjects to tutors', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()
    const adminToken = await issueToken(adminIdentity)

    const response = await tutorSubjectsByTutor.subjects.$post({
      param: { tutorId: tutor.id },
      json: { subjectId: subject.id },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CREATED)
  })

  it('returns conflict on duplicate tutor-subject assignments', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()
    const adminToken = await issueToken(adminIdentity)

    await tutorSubjectsByTutor.subjects.$post({
      param: { tutorId: tutor.id },
      json: { subjectId: subject.id },
      header: bearer(adminToken)
    })

    const response = await tutorSubjectsByTutor.subjects.$post({
      param: { tutorId: tutor.id },
      json: { subjectId: subject.id },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.CONFLICT)
  })

  it('lists subjects for a tutor', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()
    const adminToken = await issueToken(adminIdentity)

    await tutorSubjectsByTutor.subjects.$post({
      param: { tutorId: tutor.id },
      json: { subjectId: subject.id },
      header: bearer(adminToken)
    })

    const response = await tutorSubjectsByTutor.subjects.$get({
      param: { tutorId: tutor.id },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as Array<{ id: string }>
    expect(body.map(row => row.id)).toContain(subject.id)
  })

  it('lists tutors for a subject', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()
    const adminToken = await issueToken(adminIdentity)

    await tutorSubjectsByTutor.subjects.$post({
      param: { tutorId: tutor.id },
      json: { subjectId: subject.id },
      header: bearer(adminToken)
    })

    const response = await subjectsById.tutors.$get({
      param: { subjectId: subject.id },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.OK)
    const body = await response.json() as Array<{ id: string }>
    expect(body.map(row => row.id)).toContain(tutor.id)
  })

  it('allows tutors to remove subjects from themselves', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()
    const tutorToken = await issueToken({
      id: tutor.id,
      email: 'tutor@example.com',
      role: 'tutor'
    })

    await tutorSubjectsByTutor.subjects.$post({
      param: { tutorId: tutor.id },
      json: { subjectId: subject.id },
      header: bearer(tutorToken)
    })

    const response = await tutorSubjectsByTutor.subjects[':subjectId'].$delete({
      param: { tutorId: tutor.id, subjectId: subject.id },
      header: bearer(tutorToken)
    })

    expect(response.status).toBe(HttpStatusCodes.NO_CONTENT)
  })

  it('allows admins to remove subjects from tutors', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()
    const adminToken = await issueToken(adminIdentity)

    await tutorSubjectsByTutor.subjects.$post({
      param: { tutorId: tutor.id },
      json: { subjectId: subject.id },
      header: bearer(adminToken)
    })

    const response = await tutorSubjectsByTutor.subjects[':subjectId'].$delete({
      param: { tutorId: tutor.id, subjectId: subject.id },
      header: bearer(adminToken)
    })

    expect(response.status).toBe(HttpStatusCodes.NO_CONTENT)
  })
})
