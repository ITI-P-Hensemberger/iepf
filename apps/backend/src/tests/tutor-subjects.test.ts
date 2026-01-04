// Purpose: Tutor-subject join table integration tests.
import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import db from '@/db'
import { subjects } from '@/db/schemas/subjects.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'
import env from '@/env'
import { hashPassword } from '@/lib/password'
import { ensureTestSchema } from '@/tests/test-setup'

if (env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV must be \'test\'')
}

async function createTutor() {
  const passwordHash = await hashPassword('TutorPass123!')
  const [user] = await db.insert(users).values({
    email: `tutor-${randomUUID()}@example.com`,
    firstName: 'Tutor',
    lastName: 'Example',
    passwordHash,
    role: 'tutor',
    emailVerifiedAt: new Date()
  }).returning({
    id: users.id
  })
  return user
}

async function createSubject() {
  const [subject] = await db.insert(subjects).values({
    name: 'Algebra',
    canonicalName: `algebra-${randomUUID()}`
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

describe('tutorSubjects', () => {
  it('links tutors to subjects', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()

    const [inserted] = await db.insert(tutorSubjects).values({
      tutorId: tutor.id,
      subjectId: subject.id
    }).returning({
      id: tutorSubjects.id,
      tutorId: tutorSubjects.tutorId,
      subjectId: tutorSubjects.subjectId
    })

    expect(inserted).toMatchObject({
      tutorId: tutor.id,
      subjectId: subject.id
    })
  })

  it('prevents duplicate tutor-subject pairs', async () => {
    const tutor = await createTutor()
    const subject = await createSubject()

    await db.insert(tutorSubjects).values({
      tutorId: tutor.id,
      subjectId: subject.id
    })

    // Duplicate inserts should not create a second mapping.
    try {
      await db.insert(tutorSubjects).values({
        tutorId: tutor.id,
        subjectId: subject.id
      })
    }
    catch {
      // Ignore expected constraint errors from SQLite.
    }

    const rows = await db.query.tutorSubjects.findMany({
      where(fields, operators) {
        return operators.and(
          operators.eq(fields.tutorId, tutor.id),
          operators.eq(fields.subjectId, subject.id)
        )
      }
    })

    expect(rows).toHaveLength(1)
  })
})
