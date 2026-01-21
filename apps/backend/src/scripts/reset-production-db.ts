// Purpose: Reset production database for clean migration setup
import { Pool } from 'pg'

import env from '@/env'

const pool = new Pool({ connectionString: env.DATABASE_URL })

async function main() {
  process.stdout.write('⚠️  WARNING: This will destroy all data in the database!\n')
  process.stdout.write('Dropping all tables...\n')

  // Drop all tables in reverse dependency order
  await pool.query('DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "token_ledger" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "lesson_bookings" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "lessons" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "tutor_availability" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "tutor_weekday_availability" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "tutor_subjects" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "tutor_settings" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "tutor_invite_tokens" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "admin_invite_tokens" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "tutor_profiles" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "student_profiles" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "admin_profiles" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "subjects" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "refresh_tokens" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "password_reset_tokens" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "email_verification_tokens" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "audit_logs" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "users" CASCADE')
  await pool.query('DROP TABLE IF EXISTS "class_sections" CASCADE')

  process.stdout.write('✓ All tables dropped\n')
  process.stdout.write('Database is clean. Run db:migrate to apply migrations.\n')

  await pool.end()
}

main().catch((error) => {
  console.error('Failed to reset database.', error)
  process.exit(1)
})
