// Purpose: Shared test helpers for seeded users and profiles.
import { randomUUID } from 'node:crypto'

import db from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { classSections } from '@/db/schemas/class-sections.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { users } from '@/db/schemas/users.schema'

export async function seedAdminUser(id: string, email: string) {
  await db.insert(users).values({
    id,
    email,
    firstName: 'Admin',
    lastName: 'Test',
    passwordHash: 'hash',
    role: 'admin',
    emailVerifiedAt: new Date()
  })

  await db.insert(adminProfiles).values({
    userId: id,
    isActive: true
  })
}

export async function seedClassSection(name?: string) {
  const [section] = await db.insert(classSections).values({
    name: name ?? `T${randomUUID().slice(0, 6)}`
  }).returning({ id: classSections.id })

  return section.id
}

export async function attachActiveTutorProfile(userId: string, sectionId?: string, year = 4) {
  const resolvedSectionId = sectionId ?? await seedClassSection()
  await db.insert(tutorProfiles).values({
    userId,
    sectionId: resolvedSectionId,
    year,
    isActive: true
  })
}
