import type { NextConfig } from 'next'
import path from 'node:path'

// pnpm links dependencies from the workspace root, so both roots must include it.
// Standalone output therefore starts from apps/frontend/server.js.
const workspaceRoot = path.resolve(__dirname, '../..')

// Host only and short at first: browsers refuse plain HTTP for this long, and it cannot be
// withdrawn from a browser that already saw it. Raise it once HTTPS has proved stable.
const HSTS_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: `max-age=${HSTS_MAX_AGE_SECONDS}` },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Reset and verification links carry tokens: other sites must only see the origin.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
]

// Next.js inlines its bootstrap scripts, and a nonce would make every page dynamic: inline
// scripts stay allowed, so this limits where code can load from and send data to.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ')

// Dev mode needs eval and a websocket, which the policy rightly forbids.
const headers = process.env.NODE_ENV === 'development'
  ? securityHeaders
  : [...securityHeaders, { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy }]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers: async () => [
    { source: '/:path*', headers },
    // Browsers check for a new service worker on every visit: it must never come from a cache.
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' }
      ]
    }
  ],
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot
  }
}

export default nextConfig
