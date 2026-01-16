// Purpose: Drizzle configuration for schema and migrations.
import { defineConfig } from 'drizzle-kit'

import env from '@/env'

export default defineConfig({
  schema: './src/db/schemas',
  out: './src/db/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: env.DATABASE_URL
  }
})
