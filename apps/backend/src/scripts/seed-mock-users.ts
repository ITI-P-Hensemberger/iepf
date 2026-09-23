// Purpose: Seed mock users for demos/testing.
import db, { closeDb } from '@/db'
import { adminProfiles } from '@/db/schemas/admin-profiles.schema'
import { studentProfiles } from '@/db/schemas/student-profiles.schema'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { tutorProfiles } from '@/db/schemas/tutor-profiles.schema'
import { tutorSettings } from '@/db/schemas/tutor-settings.schema'
import { users } from '@/db/schemas/users.schema'
import { issueAdminInviteToken } from '@/lib/admin-invite'
import { DEFAULT_LESSON_TOKENS, DEFAULT_TUTOR_SETTINGS } from '@/lib/constants'
import { hashPassword } from '@/lib/password'
import { issueTutorInviteToken } from '@/lib/tutor-invite'

const EMAIL_PREFIX = 'jordan.castiglioni+'
const EMAIL_DOMAIN = '@hensemberger.it'
const DEFAULT_PASSWORD = 'Password123!'

function buildEmail(alias: string) {
  return `${EMAIL_PREFIX}${alias}${EMAIL_DOMAIN}`
}

const ITALIAN_FIRST_NAMES = [
  'Marco',
  'Luca',
  'Matteo',
  'Giovanni',
  'Alessandro',
  'Francesco',
  'Andrea',
  'Davide',
  'Stefano',
  'Simone',
  'Gabriele',
  'Riccardo',
  'Federico',
  'Tommaso',
  'Emanuele',
  'Pietro',
  'Nicolo',
  'Giulio',
  'Filippo',
  'Lorenzo',
  'Giada',
  'Chiara',
  'Martina',
  'Sara',
  'Francesca',
  'Elena',
  'Alessia',
  'Sofia',
  'Valentina',
  'Camilla',
  'Giorgia',
  'Alice',
  'Beatrice',
  'Aurora',
  'Viola',
  'Marta',
  'Ilaria',
  'Noemi',
  'Rachele',
  'Arianna'
]

const ITALIAN_LAST_NAMES = [
  'Rossi',
  'Russo',
  'Ferrari',
  'Esposito',
  'Bianchi',
  'Romano',
  'Colombo',
  'Ricci',
  'Marino',
  'Greco',
  'Bruno',
  'Gallo',
  'Conti',
  'Costa',
  'Giordano',
  'Mancini',
  'Rizzo',
  'Lombardi',
  'Moretti',
  'Barbieri',
  'Fontana',
  'Santoro',
  'Mariani',
  'Rinaldi',
  'Caruso',
  'Ferrara',
  'Galli',
  'Martini',
  'Leone',
  'Longo',
  'Gentile',
  'Martinelli',
  'Vitale',
  'Lombardo',
  'Serra',
  'Coppola',
  'De Luca',
  'Bernardi',
  'Ferri',
  'Fabbri'
]

function pickName(index: number) {
  const firstName = ITALIAN_FIRST_NAMES[index % ITALIAN_FIRST_NAMES.length]!
  const lastName = ITALIAN_LAST_NAMES[index % ITALIAN_LAST_NAMES.length]!
  return { firstName, lastName }
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

  const existingLedger = await db.query.tokenLedger.findFirst({
    where(fields, operators) {
      return operators.eq(fields.studentId, userId)
    },
    columns: { id: true }
  })

  if (!existingLedger) {
    await db.insert(tokenLedger).values({
      studentId: userId,
      delta: DEFAULT_LESSON_TOKENS,
      reason: 'initial_grant'
    })
  }
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
    const { firstName, lastName } = pickName(i)
    const { id } = await getOrCreateUser(email, 'student', firstName, lastName, passwordHash, true)
    const section = nextSection()
    const year = (i % 3) + 1
    await ensureStudentProfile(id, section.id, year, true)
    created += 1
  }

  for (let i = 1; i <= totals.studentsInactive; i += 1) {
    const email = buildEmail(`student-inactive-${String(i).padStart(2, '0')}`)
    const { firstName, lastName } = pickName(i + 100)
    const { id } = await getOrCreateUser(email, 'student', firstName, lastName, passwordHash, true)
    const section = nextSection()
    const year = (i % 3) + 1
    await ensureStudentProfile(id, section.id, year, false)
    created += 1
  }

  for (let i = 1; i <= totals.studentsUnverified; i += 1) {
    const email = buildEmail(`student-pending-${String(i).padStart(2, '0')}`)
    const { firstName, lastName } = pickName(i + 200)
    const { id } = await getOrCreateUser(email, 'student', firstName, lastName, passwordHash, true)
    const section = nextSection()
    const year = (i % 3) + 1
    await ensureStudentProfile(id, section.id, year, false)
    created += 1
  }

  for (let i = 1; i <= totals.tutorsActive; i += 1) {
    const email = buildEmail(`tutor-active-${String(i).padStart(2, '0')}`)
    const { firstName, lastName } = pickName(i + 300)
    const { id } = await getOrCreateUser(email, 'tutor', firstName, lastName, passwordHash, true)
    const section = nextSection()
    const year = (i % 2) + 4
    await ensureTutorProfile(id, section.id, year, true)
    created += 1
  }

  for (let i = 1; i <= totals.tutorsInactive; i += 1) {
    const email = buildEmail(`tutor-inactive-${String(i).padStart(2, '0')}`)
    const { firstName, lastName } = pickName(i + 400)
    const { id } = await getOrCreateUser(email, 'tutor', firstName, lastName, passwordHash, true)
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
    const { firstName, lastName } = pickName(i + 500)
    const { id } = await getOrCreateUser(email, 'admin', firstName, lastName, passwordHash, true)
    await ensureAdminProfile(id, true)
    created += 1
  }

  for (let i = 1; i <= totals.adminsInactive; i += 1) {
    const email = buildEmail(`admin-inactive-${String(i).padStart(2, '0')}`)
    const { firstName, lastName } = pickName(i + 600)
    const { id } = await getOrCreateUser(email, 'admin', firstName, lastName, passwordHash, true)
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

main()
  .catch((error) => {
    console.error('Failed to seed mock users.', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
