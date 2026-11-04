// Purpose: Shared helper to truncate all Postgres tables for test/dev resets.
import { Pool } from 'pg'

import env from '@/env'
import { assertLocalDatabase } from '@/lib/local-database'

export async function cleanDatabase() {
  assertLocalDatabase(env.DATABASE_URL, env.NODE_ENV)
  const pool = new Pool({ connectionString: env.DATABASE_URL })
  try {
    const { rows } = await pool.query(
      'select tablename from pg_tables where schemaname=\'public\' and tablename != \'__drizzle_migrations\''
    )
    const tables = rows.map(row => `"${row.tablename}"`)
    if (tables.length > 0) {
      await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`)
    }
  }
  finally {
    await pool.end()
  }
}
