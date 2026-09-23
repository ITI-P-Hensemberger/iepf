// Purpose: Seed mock tutor-to-subject associations for demo/testing.
import { and, eq, ilike } from 'drizzle-orm'

import db, { closeDb } from '@/db'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSubjects } from '@/db/schemas/tutor-subjects.schema'
import { users } from '@/db/schemas/users.schema'

const EMAIL_PREFIX = 'jordan.castiglioni+'
const EMAIL_DOMAIN = '@hensemberger.it'

async function getMockActiveTutors() {
  const emailPattern = `${EMAIL_PREFIX}tutor-%${EMAIL_DOMAIN}`
  return db
    .select({
      id: users.id
    })
    .from(users)
    .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .where(and(
      eq(users.role, 'tutor'),
      eq(tutorProfiles.isActive, true),
      ilike(users.email, emailPattern)
    ))
}

async function getSubjects() {
  const rows = await db.query.subjects.findMany({
    columns: { id: true }
  })
  if (rows.length === 0) {
    throw new Error('No subjects found. Seed subjects first.')
  }
  return rows
}

function pickSubjectIds(tutorIndex: number, allSubjectIds: string[]) {
  const count = 3 + (tutorIndex % 2)
  const start = tutorIndex % allSubjectIds.length
  const picks: string[] = []

  for (let i = 0; i < count; i += 1) {
    const id = allSubjectIds[(start + i) % allSubjectIds.length]
    if (!picks.includes(id)) {
      picks.push(id)
    }
  }

  return picks
}

async function main() {
  const tutors = await getMockActiveTutors()

  if (tutors.length === 0) {
    process.stdout.write('No active mock tutors found. Seed mock users first.\n')
    return
  }

  const subjectRows = await getSubjects()
  const subjectIds = subjectRows.map(row => row.id)

  const rows = tutors.flatMap((tutor, index) => {
    const picks = pickSubjectIds(index, subjectIds)
    return picks.map(subjectId => ({
      tutorId: tutor.id,
      subjectId
    }))
  })

  if (rows.length === 0) {
    process.stdout.write('No tutor subject associations to seed.\n')
    return
  }

  await db.insert(tutorSubjects).values(rows).onConflictDoNothing({
    target: [tutorSubjects.tutorId, tutorSubjects.subjectId]
  })

  process.stdout.write(`Mock tutor subjects seeded. Attempted ${rows.length} associations.\n`)
}

main()
  .catch((error) => {
    console.error('Failed to seed mock tutor subjects.', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
