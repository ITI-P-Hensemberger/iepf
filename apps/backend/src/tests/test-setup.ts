// Purpose: Shared test setup helpers (schema initialization).
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const lockDir = path.resolve('.tmp')
const lockFile = path.join(lockDir, 'test-schema.lock')

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function ensureTestSchema() {
  // Always apply schema changes before tests to keep SQLite in sync.
  fs.mkdirSync(lockDir, { recursive: true })

  try {
    const fd = fs.openSync(lockFile, 'wx')
    fs.closeSync(fd)
    execSync('pnpm drizzle-kit push')
    fs.unlinkSync(lockFile)
  }
  catch (error: any) {
    if (error?.code !== 'EEXIST') {
      throw error
    }

    while (fs.existsSync(lockFile)) {
      await sleep(50)
    }
  }
}
