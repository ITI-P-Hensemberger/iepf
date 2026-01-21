// Purpose: Mark migrations 0006-0007 as applied (for production that used SQL script)
import { Pool } from 'pg'

import env from '@/env'

const pool = new Pool({ connectionString: env.DATABASE_URL })

async function main() {
  // Check if 0006 and 0007 are already marked as applied
  const { rows } = await pool.query(`
    SELECT hash FROM "__drizzle_migrations"
    WHERE hash IN ('0006_happy_robbie_robertson', '0007_rename_default_seats_to_daily_capacity')
  `)

  const existingHashes = new Set(rows.map((r: { hash: string }) => r.hash))

  const migrations = [
    { hash: '0006_happy_robbie_robertson', created_at: 1769005369916 },
    { hash: '0007_rename_default_seats_to_daily_capacity', created_at: 1769010000000 }
  ]

  const missing = migrations.filter(m => !existingHashes.has(m.hash))

  if (missing.length === 0) {
    process.stdout.write('Migrations 0006-0007 already marked as applied.\n')
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
