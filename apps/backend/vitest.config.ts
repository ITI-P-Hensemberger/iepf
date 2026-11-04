// Purpose: Vitest configuration for unit tests.
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    // Integration tests share one isolated PostgreSQL database.
    sequence: {
      concurrent: false
    },
    testTimeout: 30000,
    // Allow schema pushes to finish in slower environments.
    hookTimeout: 30000,
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
})
