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
    // Run tests sequentially to avoid SQLite lock contention.
    sequence: {
      concurrent: false
    },
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
