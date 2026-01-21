// Purpose: Seed migration journal for production database that has schema but missing journal entries
import { Pool } from 'pg'

import env from '@/env'

const pool = new Pool({ connectionString: env.DATABASE_URL })

async function main() {
  // Create the migrations table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `)

  // Check if any migrations are already recorded
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM "__drizzle_migrations"')
  if (Number.parseInt(rows[0].count) > 0) {
    process.stdout.write('Migration journal already has entries. Skipping seed.\n')
    await pool.end()
    return
  }

  process.stdout.write('Seeding migration journal with existing migrations (0000-0005)...\n')

  // Insert entries for migrations that have already been applied to production
  const migrations = [
    { hash: '0000_init', created_at: 1768748643333 },
    { hash: '0001_tutor_invite_tokens', created_at: 1768840000000 },
    { hash: '0002_tutor_profiles_require_section_year', created_at: 1768845000000 },
    { hash: '0003_tutor_profiles_add_is_active', created_at: 1768850000000 },
    { hash: '0004_admin_invite_tokens', created_at: 1768855000000 },
    { hash: '0005_admin_profiles_add_is_active', created_at: 1768858000000 }
  ]

  for (const migration of migrations) {
    await pool.query(
      'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
      [migration.hash, migration.created_at]
    )
  }

  process.stdout.write(`Seeded ${migrations.length} migration entries.\n`)
  await pool.end()
}

main().catch((error) => {
  console.error('Failed to seed migration journal.', error)
  process.exit(1)
})
