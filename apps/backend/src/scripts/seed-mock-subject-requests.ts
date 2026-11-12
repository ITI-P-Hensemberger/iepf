// Purpose: Seed mock subject requests from students, this week and last week, so the tutor home
// and the admin summary have demand to show.
import { and, eq, ilike } from 'drizzle-orm'

import db, { closeDb } from '@/db'
import { subjectRequests } from '@/db/schemas/subject-requests.schema'
import { users } from '@/db/schemas/users.schema'
import { assertMockEnvironment, MOCK_STUDENT_PATTERN } from '@/lib/mock-data'

async function main() {
  assertMockEnvironment()
  const students = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'student'), ilike(users.email, MOCK_STUDENT_PATTERN)))
  const subjectRows = await db.query.subjects.findMany({
    columns: { id: true },
    orderBy: (fields, { asc }) => asc(fields.name)
  })
  if (students.length === 0 || subjectRows.length === 0) {
    process.stdout.write('No mock students or subjects found. Seed them first.\n')
    return
  }

  const now = Date.now()
  const minute = 60 * 1000
  const rows = []
  // Twenty subjects this week, enough for more than four rows, spread over the alphabet; each asked less than the one before.
  const pick = (i: number) => subjectRows[(i * 7) % subjectRows.length].id
  for (let i = 0; i < Math.min(20, subjectRows.length); i += 1) {
    for (let s = 0; s < Math.max(1, 6 - i) && s < students.length; s += 1) {
      rows.push({
        studentId: students[(i + s) % students.length].id,
        subjectId: pick(i),
        createdAt: new Date(now - (s + 1) * minute)
      })
    }
  }
  // Last week's demand, which the tutor home must leave out.
  for (let i = 20; i < Math.min(24, subjectRows.length); i += 1) {
    rows.push({
      studentId: students[i % students.length].id,
      subjectId: pick(i),
      createdAt: new Date(now - 8 * 24 * 60 * minute)
    })
  }

  await db.insert(subjectRequests).values(rows)
  process.stdout.write(`Mock subject requests seeded: ${rows.length}.\n`)
}

main()
  .catch((error) => {
    console.error('Failed to seed mock subject requests.', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
