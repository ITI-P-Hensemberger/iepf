import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Tests run away from Rome, so code that reads the machine's clock instead of school time fails.
process.env.TZ = 'America/New_York'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname)
    }
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**']
  }
})
