// Purpose: Seed mock tutor weekday availability for demos/testing.
import { and, eq, ilike } from 'drizzle-orm'

import db, { closeDb } from '@/db'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorWeekdayAvailability } from '@/db/schemas/tutor-weekday-availability.schema'
import { users } from '@/db/schemas/users.schema'

const EMAIL_PREFIX = 'jordan.castiglioni+'
const EMAIL_DOMAIN = '@itismonza.it'

async function getMockTutors() {
  const emailPattern = `${EMAIL_PREFIX}tutor-%${EMAIL_DOMAIN}`
  return db
    .select({
      id: users.id,
      email: users.email
    })
    .from(users)
    .innerJoin(tutorProfiles, eq(tutorProfiles.userId, users.id))
    .where(and(
      eq(users.role, 'tutor'),
      ilike(users.email, emailPattern)
    ))
}

function buildWeekdays(tutorIndex: number) {
  const primary = tutorIndex % 2 === 0 ? [1, 3, 5] : [2, 4]
  return Array.from({ length: 5 }, (_, i) => {
    const weekday = i + 1
    const isAvailable = primary.includes(weekday)
    const startTime = isAvailable
      ? (weekday % 2 === 0 ? '14:00' : '15:00') as '14:00' | '15:00'
      : null
    return {
      weekday,
      isAvailable,
      startTime
    }
  })
}

async function main() {
  const tutors = await getMockTutors()

  if (tutors.length === 0) {
    process.stdout.write('No mock tutors found. Seed mock users first.\n')
    return
  }

  const rows = tutors.flatMap((tutor, index) => {
    const weekdays = buildWeekdays(index)
    return weekdays.map(day => ({
      tutorId: tutor.id,
      weekday: day.weekday,
      isAvailable: day.isAvailable,
      startTime: day.startTime
    }))
  })

  await db.insert(tutorWeekdayAvailability)
    .values(rows)
    .onConflictDoUpdate({
      target: [tutorWeekdayAvailability.tutorId, tutorWeekdayAvailability.weekday],
      set: {
        isAvailable: tutorWeekdayAvailability.isAvailable,
        startTime: tutorWeekdayAvailability.startTime
      }
    })

  process.stdout.write(`Mock tutor weekday availability seeded. Upserted ${rows.length} rows.\n`)
}

main()
  .catch((error) => {
    console.error('Failed to seed mock tutor weekday availability.', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
