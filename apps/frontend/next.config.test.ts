import { describe, expect, it } from 'vitest'

import nextConfig from './next.config'

describe('security headers', () => {
  it('applies them to every path', async () => {
    const rules = await nextConfig.headers!()

    expect(rules[0].source).toBe('/:path*')
    expect(Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]))).toMatchObject({
      'Strict-Transport-Security': 'max-age=2592000',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    })
  })

  it('enforces the content security policy', async () => {
    const rules = await nextConfig.headers!()
    const keys = rules[0].headers.map(({ key }) => key)
    const policy = rules[0].headers.find(({ key }) => key === 'Content-Security-Policy')?.value

    expect(keys).not.toContain('Content-Security-Policy-Report-Only')
    expect(policy).toContain("connect-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
  })

  it('never serves the service worker from a cache', async () => {
    const rules = await nextConfig.headers!()
    const worker = rules.find(({ source }) => source === '/sw.js')

    expect(worker?.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' })
  })

  it('does not advertise the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })
})
