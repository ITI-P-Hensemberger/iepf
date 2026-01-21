// Purpose: Apply schema changes directly via SQL (bypasses drizzle-kit)
import { Pool } from 'pg'

import env from '@/env'

const pool = new Pool({ connectionString: env.DATABASE_URL })

async function main() {
  process.stdout.write('Applying schema changes...\n')

  // Create tutor_weekday_availability table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "tutor_weekday_availability" (
      "id" uuid PRIMARY KEY NOT NULL,
      "tutor_id" uuid NOT NULL,
      "weekday" smallint NOT NULL,
      "is_available" boolean DEFAULT false NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "tutor_weekday_availability_tutor_id_users_id_fk"
        FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE CASCADE
    )
  `)
  process.stdout.write('  ✓ tutor_weekday_availability table created\n')

  // Create unique index
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "tutor_weekday_availability_tutor_weekday_unique"
    ON "tutor_weekday_availability" ("tutor_id", "weekday")
  `)
  process.stdout.write('  ✓ unique index created\n')

  // Add columns to lessons table if they don't exist
  await pool.query(`
    ALTER TABLE "lessons"
    ADD COLUMN IF NOT EXISTS "generated_by_job" boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS "generated_for_week" timestamp
  `)
  process.stdout.write('  ✓ lessons table columns added\n')

  process.stdout.write('Schema changes applied successfully.\n')
  await pool.end()
}

main().catch((error) => {
  console.error('Failed to apply schema changes.', error)
  process.exit(1)
})
