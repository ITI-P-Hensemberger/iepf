// Purpose: Debug what's in the migration journal
import { Pool } from 'pg'

import env from '@/env'

const pool = new Pool({ connectionString: env.DATABASE_URL })

async function main() {
  try {
    const { rows } = await pool.query('SELECT * FROM "__drizzle_migrations" ORDER BY id')
    process.stdout.write(`Found ${rows.length} entries in migration journal:\n`)
    for (const row of rows) {
      process.stdout.write(JSON.stringify(row, null, 2) + '\n')
    }
  }
  catch (error: unknown) {
    if (error instanceof Error) {
      process.stderr.write(`Error: ${error.message}\n`)
    }
  }
  finally {
    await pool.end()
  }
}

main()
