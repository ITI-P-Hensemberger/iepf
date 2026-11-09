import { execFileSync } from 'node:child_process'
import path from 'node:path'

// The dev-seed accounts plus every lesson case (seed-lesson-scenarios.ts), around FAKE_NOW.
export default function globalSetup() {
  execFileSync('npx', ['tsx', 'src/scripts/seed-lesson-scenarios.ts'], {
    cwd: path.resolve(__dirname, '../../backend'),
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'inherit'
  })
}
