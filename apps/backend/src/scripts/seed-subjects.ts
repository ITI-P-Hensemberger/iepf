// Purpose: Seed baseline subjects for the app.
import db from '@/db'
import { subjects } from '@/db/schemas/subjects.schema'

const DEFAULT_SUBJECTS = [
  // Generic subjects
  { name: 'Matematica', canonicalName: 'mathematics' },
  { name: 'Fisica', canonicalName: 'physics' },
  { name: 'Scienze', canonicalName: 'science' },
  { name: 'Storia', canonicalName: 'history' },
  { name: 'Geografia', canonicalName: 'geography' },
  { name: 'Italiano', canonicalName: 'italian' },
  { name: 'Inglese - Lingua', canonicalName: 'english' },
  { name: 'Informatica', canonicalName: 'computer_science' },
  { name: 'TTRG', canonicalName: 'graphic_representation_technologies_and_techniques' },
  { name: 'Diritto ed economia', canonicalName: 'law_and_economics' },

  // Biotecnologie Sanitarie
  { name: 'STA - Biotecnologie Sanitarie', canonicalName: 'applied_sciences_and_technologies_health_biotechnologies' },
  { name: 'Chimica', canonicalName: 'chemistry' },
  { name: 'Chimica analitica', canonicalName: 'analytical_chemistry' },
  { name: 'Chimica organica', canonicalName: 'organic_chemistry' },
  { name: 'Igiene', canonicalName: 'hygiene_anatomy_physiology_and_pathology' },
  { name: 'Biologia', canonicalName: 'biology' },

  // Elettronica ed Elettrotecnica
  { name: 'STA - Elettronica ed Elettrotecnica', canonicalName: 'applied_sciences_and_technologies_electronics_and_electrical_engineering' },
  { name: 'TPSE', canonicalName: 'tpse' },
  { name: 'Elettronica', canonicalName: 'electronics_and_electrical_engineering' },
  { name: 'Automazione', canonicalName: 'automatic_systems' },

  // Meccanica e Meccatronica
  { name: 'STA - Meccanica e Meccatronica', canonicalName: 'applied_sciences_and_technologies_mechanics_and_mechatronics' },
  { name: 'Meccanica', canonicalName: 'mechanics' },
  { name: 'Disegno industriale', canonicalName: 'industrial_design_planning_and_organization' },

  // Informatica e Telecomunicazioni
  { name: 'STA - Informatica e Telecomunicazioni', canonicalName: 'applied_sciences_and_technologies_computer_science_and_telecommunications' },
  { name: 'Sistemi e reti', canonicalName: 'systems_and_networks' },
  { name: 'TPSI', canonicalName: 'technologies_and_design_of_computer_and_telecommunication_systems' },
  { name: 'Telecomunicazioni', canonicalName: 'telecommunications' },

  // Liceo Scienze Applicate
  { name: 'Inglese - Letteratura', canonicalName: 'english_literature' },
  { name: 'Filosofia', canonicalName: 'philosophy' },
  { name: 'Storia dell\'arte', canonicalName: 'art_history' }
]

try {
  await db
    .insert(subjects)
    .values(DEFAULT_SUBJECTS.map(({ name, canonicalName }) => ({ name, canonicalName })))
    .onConflictDoNothing({ target: subjects.canonicalName })
  process.stdout.write('Subjects seeded.\n')
}
catch (error) {
  console.error('Failed to seed subjects.', error)
  process.exit(1)
}
