// Purpose: Seed mock users for demos/testing.
import db from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { classSections } from '@/db/schemas/class-sections.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { users } from '@/db/schemas/users.schema'
import { DEFAULT_TUTOR_SETTINGS } from '@/lib/constants'
import { issueAdminInviteToken } from '@/lib/admin-invite'
import { issueTutorInviteToken } from '@/lib/tutor-invite'
import { hashPassword } from '@/lib/password'

const EMAIL_PREFIX = 'jordan.castiglioni+'
const EMAIL_DOMAIN = '@itismonza.it'
const DEFAULT_PASSWORD = 'Password123!'

function buildEmail(alias: string) {
  return `${EMAIL_PREFIX}${alias}${EMAIL_DOMAIN}`
}

async function getSections() {
  const sections = await db.query.classSections.findMany({
    columns: { id: true, name: true }
  })
  if (sections.length === 0) {
    throw new Error('No class sections found. Seed class sections first.')
  }
  return sections
}

async function getOrCreateUser(email: string, role: 'student' | 'tutor' | 'admin' | 'activator', firstName: string, lastName: string, passwordHash: string, verified: boolean) {
  const existing = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, email)
    },
    columns: { id: true, role: true }
  })

  if (existing) {
    return { id: existing.id, role: existing.role }
  }

  const [inserted] = await db.insert(users).values({
    email,
    firstName,
    lastName,
    passwordHash,
    role,
    emailVerifiedAt: verified ? new Date() : null
  }).returning({
    id: users.id,
    role: users.role
  })

  return { id: inserted.id, role: inserted.role }
}

async function ensureAdminProfile(userId: string, isActive = true) {
  await db.insert(adminProfiles)
    .values({ userId, isActive })
    .onConflictDoNothing({ target: adminProfiles.userId })
}

async function ensureStudentProfile(userId: string, sectionId: string, year: number, isActive: boolean) {
  await db.insert(studentProfiles)
    .values({
      userId,
      sectionId,
      year,
      isActive
    })
    .onConflictDoNothing({ target: studentProfiles.userId })
}

async function ensureTutorProfile(userId: string, sectionId: string, year: number, isActive: boolean) {
  await db.insert(tutorProfiles)
    .values({
      userId,
      sectionId,
      year,
      isActive
    })
    .onConflictDoNothing({ target: tutorProfiles.userId })

  await db.insert(tutorSettings)
    .values({
      tutorId: userId,
      ...DEFAULT_TUTOR_SETTINGS
    })
    .onConflictDoNothing({ target: tutorSettings.tutorId })
}

async function main() {
  const sections = await getSections()
  const passwordHash = await hashPassword(DEFAULT_PASSWORD)

  const totals = {
    studentsActive: 30,
    studentsInactive: 20,
    studentsUnverified: 10,
    tutorsActive: 25,
    tutorsInactive: 10,
    tutorInvites: 10,
    adminsActive: 1,
    adminsInactive: 1,
    adminInvites: 1
  }

  let sectionIndex = 0
  const nextSection = () => {
    const section = sections[sectionIndex % sections.length]
    sectionIndex += 1
    return section
  }

  let created = 0

  for (let i = 1; i <= totals.studentsActive; i += 1) {
    const email = buildEmail(`student-active-${String(i).padStart(2, '0')}`)
    const { id } = await getOrCreateUser(email, 'student', 'Studente', `Attivo${i}`, passwordHash, true)
    const section = nextSection()
    const year = (i % 3) + 1
    await ensureStudentProfile(id, section.id, year, true)
    created += 1
  }

  for (let i = 1; i <= totals.studentsInactive; i += 1) {
    const email = buildEmail(`student-inactive-${String(i).padStart(2, '0')}`)
    const { id } = await getOrCreateUser(email, 'student', 'Studente', `NonAttivo${i}`, passwordHash, true)
    const section = nextSection()
    const year = (i % 3) + 1
    await ensureStudentProfile(id, section.id, year, false)
    created += 1
  }

  for (let i = 1; i <= totals.studentsUnverified; i += 1) {
    const email = buildEmail(`student-pending-${String(i).padStart(2, '0')}`)
    const { id } = await getOrCreateUser(email, 'student', 'Studente', `NonVerificato${i}`, passwordHash, true)
    const section = nextSection()
    const year = (i % 3) + 1
    await ensureStudentProfile(id, section.id, year, false)
    created += 1
  }

  for (let i = 1; i <= totals.tutorsActive; i += 1) {
    const email = buildEmail(`tutor-active-${String(i).padStart(2, '0')}`)
    const { id } = await getOrCreateUser(email, 'tutor', 'Tutor', `Attivo${i}`, passwordHash, true)
    const section = nextSection()
    const year = (i % 2) + 4
    await ensureTutorProfile(id, section.id, year, true)
    created += 1
  }

  for (let i = 1; i <= totals.tutorsInactive; i += 1) {
    const email = buildEmail(`tutor-inactive-${String(i).padStart(2, '0')}`)
    const { id } = await getOrCreateUser(email, 'tutor', 'Tutor', `User${i}`, passwordHash, true)
    const section = nextSection()
    const year = (i % 2) + 4
    await ensureTutorProfile(id, section.id, year, false)
    created += 1
  }

  for (let i = 1; i <= totals.tutorInvites; i += 1) {
    const email = buildEmail(`tutor-invite-${String(i).padStart(2, '0')}`)
    await issueTutorInviteToken(email)
    created += 1
  }

  for (let i = 1; i <= totals.adminsActive; i += 1) {
    const email = buildEmail(`admin-active-${String(i).padStart(2, '0')}`)
    const { id } = await getOrCreateUser(email, 'admin', 'Admin', `Attivo${i}`, passwordHash, true)
    await ensureAdminProfile(id, true)
    created += 1
  }

  for (let i = 1; i <= totals.adminsInactive; i += 1) {
    const email = buildEmail(`admin-inactive-${String(i).padStart(2, '0')}`)
    const { id } = await getOrCreateUser(email, 'admin', 'Admin', `NonAttivo${i}`, passwordHash, true)
    await ensureAdminProfile(id, false)
    created += 1
  }

  for (let i = 1; i <= totals.adminInvites; i += 1) {
    const email = buildEmail(`admin-invite-${String(i).padStart(2, '0')}`)
    await issueAdminInviteToken(email)
    created += 1
  }

  process.stdout.write(`Mock users seed complete. Attempted ${created} records.
`)
}

main().catch((error) => {
  console.error('Failed to seed mock users.', error)
  process.exit(1)
})
