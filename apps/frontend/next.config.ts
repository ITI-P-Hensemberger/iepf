import type { NextConfig } from 'next'
import path from 'node:path'

// pnpm links dependencies from the workspace root, so both roots must include it.
// Standalone output therefore starts from apps/frontend/server.js.
const workspaceRoot = path.resolve(__dirname, '../..')

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot
  }
}

export default nextConfig
