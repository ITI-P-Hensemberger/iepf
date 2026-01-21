// Purpose: Fix corrupted migration journal by resetting and reseeding correctly
import { Pool } from 'pg'

import env from '@/env'

const pool = new Pool({ connectionString: env.DATABASE_URL })

async function main() {
  process.stdout.write('Fixing migration journal...\n')

  // Drop and recreate the journal table
  await pool.query('DROP TABLE IF EXISTS "__drizzle_migrations"')
  await pool.query(`
    CREATE TABLE "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)

  // Insert all migrations that have been applied to production (0000-0005)
  const migrations = [
    { hash: '0000_init', created_at: 1768748643333 },
    { hash: '0001_tutor_invite_tokens', created_at: 1768840000000 },
    { hash: '0002_tutor_profiles_require_section_year', created_at: 1768845000000 },
    { hash: '0003_tutor_profiles_add_is_active', created_at: 1768850000000 },
    { hash: '0004_admin_invite_tokens', created_at: 1768855000000 },
    { hash: '0005_admin_profiles_add_is_active', created_at: 1768858000000 }
  ]

  process.stdout.write(`Inserting ${migrations.length} migration entries...\n`)

  for (const migration of migrations) {
    await pool.query(
      'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
      [migration.hash, migration.created_at]
    )
    process.stdout.write(`  ✓ ${migration.hash}\n`)
  }

  // Check if default_seats column exists and rename it
  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'tutor_settings'
    AND column_name = 'default_seats'
  `)

  if (rows.length > 0) {
    process.stdout.write('Renaming default_seats → daily_capacity...\n')
    await pool.query('ALTER TABLE tutor_settings RENAME COLUMN default_seats TO daily_capacity')
    process.stdout.write('  ✓ Column renamed\n')
  }
  else {
    process.stdout.write('Column daily_capacity already exists, skipping rename.\n')
  }

  process.stdout.write('Migration journal fixed. Ready for db:migrate to apply 0006-0007.\n')
  await pool.end()
}

main().catch((error) => {
  console.error('Failed to fix migration journal.', error)
  process.exit(1)
})
