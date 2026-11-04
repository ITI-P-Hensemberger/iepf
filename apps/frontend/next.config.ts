import type { NextConfig } from 'next'
import withPWA from 'next-pwa'
import path from 'node:path'

// pnpm links dependencies from the workspace root, so both roots must include it.
const workspaceRoot = path.resolve(__dirname, '../..')

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot
  }
}

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  fallbacks: {
    document: '/offline.html'
  }
})(nextConfig)
