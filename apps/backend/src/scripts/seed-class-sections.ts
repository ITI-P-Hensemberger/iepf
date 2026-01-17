// Purpose: Seed baseline class sections for the app.
import db from '@/db'
import { classSections } from '@/db/schemas/class-sections.schema'

const DEFAULT_SECTIONS = [
  'AL',
  'BL',
  'CL',
  'A1',
  'A2',
  'A3',
  'B1',
  'C1',
  'C2',
  'C3',
  'D1',
  'D2',
  'D3',
  'D4',
  'D5',
  'DT'
]

try {
  await db
    .insert(classSections)
    .values(DEFAULT_SECTIONS.map(name => ({ name })))
    .onConflictDoNothing({ target: classSections.name })
  process.stdout.write('Class sections seeded.\n')
}
catch (error) {
  console.error('Failed to seed class sections.', error)
  process.exit(1)
}
