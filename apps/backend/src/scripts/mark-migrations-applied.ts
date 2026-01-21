// Purpose: Mark all applied migrations in journal (0000-0007)
import { Pool } from 'pg'

import env from '@/env'

const pool = new Pool({ connectionString: env.DATABASE_URL })

async function main() {
  // Get all existing migration hashes
  const { rows } = await pool.query('SELECT hash FROM "__drizzle_migrations"')
  const existingHashes = new Set(rows.map((r: { hash: string }) => r.hash))

  // All migrations that should be in production
  const migrations = [
    { hash: '0000_init', created_at: 1768748643333 },
    { hash: '0001_tutor_invite_tokens', created_at: 1768840000000 },
    { hash: '0002_tutor_profiles_require_section_year', created_at: 1768845000000 },
    { hash: '0003_tutor_profiles_add_is_active', created_at: 1768850000000 },
    { hash: '0004_admin_invite_tokens', created_at: 1768855000000 },
    { hash: '0005_admin_profiles_add_is_active', created_at: 1768858000000 },
    { hash: '0006_happy_robbie_robertson', created_at: 1769005369916 },
    { hash: '0007_rename_default_seats_to_daily_capacity', created_at: 1769010000000 }
  ]

  const missing = migrations.filter(m => !existingHashes.has(m.hash))

  if (missing.length === 0) {
    process.stdout.write('All migrations (0000-0007) already marked as applied.\n')
    await pool.end()
    return
  }

  process.stdout.write(`Marking ${missing.length} migrations as applied...\n`)

  for (const migration of missing) {
    await pool.query(
      'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
      [migration.hash, migration.created_at]
    )
    process.stdout.write(`  ✓ ${migration.hash}\n`)
  }

  process.stdout.write('Migrations marked. Future migrations will use db:migrate normally.\n')
  await pool.end()
}

main().catch((error) => {
  console.error('Failed to mark migrations.', error)
  process.exit(1)
})
