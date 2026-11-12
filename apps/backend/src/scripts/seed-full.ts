// Purpose: Run the existing rich seed pipeline against local PostgreSQL and Mailpit.
/* eslint-disable node/no-process-env */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

import { assertMockEnvironment } from '@/lib/mock-data'

const require = createRequire(import.meta.url)
const steps: Array<[string, ...string[]]> = [
  ['seed-admin.ts'],
  ['seed-activator.ts'],
  ['seed-class-sections.ts'],
  ['seed-subjects.ts'],
  ['seed-global-settings.ts'],
  ['seed-mock-users.ts'],
  ['seed-mock-tutor-subjects.ts'],
  ['seed-mock-tutor-weekday-availability.ts'],
  ['generate-weekly-lessons.ts', '--mock-only'],
  ['seed-mock-lesson-bookings.ts']
]

try {
  assertMockEnvironment()
  const childEnv = {
    ...process.env,
    ADMIN_EMAIL: 'admin@example.test',
    ADMIN_PASSWORD: 'LocalDemo123!',
    ADMIN_FIRST_NAME: 'Demo',
    ADMIN_LAST_NAME: 'Admin',
    ACTIVATOR_EMAIL: 'activator@example.test',
    ACTIVATOR_PASSWORD: 'LocalDemo123!',
    ACTIVATOR_FIRST_NAME: 'Demo',
    ACTIVATOR_LAST_NAME: 'Activator'
  }
  for (const [script, ...args] of steps) {
    process.stdout.write(`Full seed: ${script}\n`)
    const result = spawnSync(process.execPath, [
      require.resolve('tsx/cli'),
      `src/scripts/${script}`,
      ...args
    ], {
      env: childEnv,
      stdio: 'inherit'
    })
    if (result.error) {
      throw result.error
    }
    if (result.status !== 0) {
      throw new Error(`${script} failed; remaining seed steps were not executed`)
    }
  }
  process.stdout.write('Full seed ready. Mock users: mock.student-active-01@example.test / mock.tutor-active-01@example.test; password: Password123!\n')
}
catch (error) {
  console.error('Full seed failed.', error)
  process.exitCode = 1
}
