// Purpose: Ensure the shared database starts and ends clean for test runs.
import { afterAll, beforeAll } from 'vitest'

import { cleanDatabase } from '@/lib/db-cleanup'

beforeAll(async () => {
  await cleanDatabase()
})

afterAll(async () => {
  await cleanDatabase()
})
