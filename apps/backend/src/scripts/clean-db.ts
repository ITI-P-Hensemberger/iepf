// Purpose: CLI helper to clean all tables in the configured Postgres database.
import { cleanDatabase } from '@/lib/db-cleanup'

try {
  await cleanDatabase()
  process.stdout.write('Database cleaned.\n')
}
catch (error) {
  console.error('Failed to clean database.', error)
  process.exit(1)
}
