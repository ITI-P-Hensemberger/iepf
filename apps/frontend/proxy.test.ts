import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config, proxy } from './proxy'

function jwt(sub: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ sub })}.signature`
}

function page(path: string, cookies: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const cookie = Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ')
  return new NextRequest(`https://iepf.test${path}`, { headers: { ...headers, ...(cookie ? { cookie } : {}) } })
}

function session(role: string) {
  return { iepf_access: jwt(role), iepf_access_expires_at: String(Date.now() + 60_000) }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockProfile(profile: { role: string, isActive: boolean }) {
  vi.stubGlobal('fetch', vi.fn(async () => json(profile)))
}

function location(response: Response) {
  const value = response.headers.get('location')
  return value ? new URL(value).pathname + new URL(value).search : null
}

describe('proxy matcher', () => {
  it.each(['/', '/student', '/admin/tutors', '/auth/login', '/auth/reset-password'])('runs on %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
  })

  it.each(['/logo.png', '/icon.png', '/apple-icon.png', '/favicon.ico', '/_next/static/chunk.js', '/api/lessons', '/sw.js', '/manifest.webmanifest', '/icons/icon-192.png'])('skips %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
  })
})

describe('proxy', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unexpected backend call') }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends anonymous visitors to login and keeps the destination', async () => {
    const response = await proxy(page('/admin/stats?tab=feedback'))
    expect(location(response)).toBe(`/auth/login?next=${encodeURIComponent('/admin/stats?tab=feedback')}`)
  })

  it('leaves public pages open to anonymous visitors', async () => {
    expect(location(await proxy(page('/faq')))).toBeNull()
    expect(location(await proxy(page('/auth/login')))).toBeNull()
  })

  it.each([
    ['student', '/admin', '/student'],
    ['student', '/tutor', '/student'],
    ['tutor', '/admin', '/tutor'],
    ['tutor', '/student', '/tutor'],
    ['activator', '/admin', '/activator'],
    ['admin', '/student', '/admin'],
    ['admin', '/activator', '/admin']
  ])('redirects %s away from %s', async (role, path, home) => {
    mockProfile({ role, isActive: true })
    expect(location(await proxy(page(path, session(role))))).toBe(home)
  })

  it('sends signed-in users from home and auth pages to their area', async () => {
    mockProfile({ role: 'tutor', isActive: true })
    expect(location(await proxy(page('/', session('tutor'))))).toBe('/tutor')
    expect(location(await proxy(page('/auth/login', session('tutor'))))).toBe('/tutor')
  })

  it.each(['/auth/reset-password', '/auth/verify-email', '/auth/sign-up-tutor', '/auth/sign-up-admin'])(
    'opens the email link %s for a signed-in user',
    async (path) => {
      mockProfile({ role: 'student', isActive: true })
      const response = await proxy(page(`${path}?token=abc`, session('student')))
      expect(location(response)).toBeNull()
      expect(response.status).toBe(200)
    }
  )

  it('keeps rotated tokens when opening an email link', async () => {
    const tokens = { accessToken: jwt('student'), tokenType: 'Bearer', expiresIn: 3600, refreshToken: 'next', refreshTokenExpiresIn: 7200 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/refresh') ? json(tokens) : json({ role: 'student', isActive: true })))
    const response = await proxy(page('/auth/reset-password?token=abc', { iepf_refresh: 'old' }))
    expect(location(response)).toBeNull()
    expect(response.headers.get('set-cookie')).toContain('iepf_refresh=next')
  })

  it('holds inactive students on the pending page', async () => {
    mockProfile({ role: 'student', isActive: false })
    expect(location(await proxy(page('/student/book', session('student'))))).toBe('/student/pending')
    expect(location(await proxy(page('/student/pending', session('student'))))).toBeNull()
  })

  it('lets active users into their own area', async () => {
    mockProfile({ role: 'student', isActive: true })
    expect(location(await proxy(page('/student/book', session('student'))))).toBeNull()
  })

  it('clears the session when the backend rejects the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401)))
    const response = await proxy(page('/student', session('student')))
    expect(location(response)).toBe('/')
    expect(response.headers.get('set-cookie')).toContain('iepf_access=;')
  })

  describe.each([
    ['429', () => json({}, 429)],
    ['500', () => json({}, 500)],
    ['503', () => json({}, 503)],
    ['a network error', () => { throw new TypeError('fetch failed') }]
  ])('when the backend answers %s', (_name, answer) => {
    const refreshOnly = { iepf_refresh: 'current', iepf_access_expires_at: '0' }

    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn(async () => answer()))
    })

    it('keeps the session and shows a retry page on protected pages', async () => {
      for (const cookies of [session('student'), refreshOnly]) {
        const response = await proxy(page('/student', cookies))
        expect(response.status).toBe(503)
        expect(location(response)).toBeNull()
        expect(response.headers.get('set-cookie')).toBeNull()
      }
    })

    it('leaves public pages open', async () => {
      const response = await proxy(page('/auth/login', session('student')))
      expect(response.status).toBe(200)
      expect(location(response)).toBeNull()
      expect(response.headers.get('set-cookie')).toBeNull()
    })
  })

  it('clears the session when the refresh token is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401)))
    const response = await proxy(page('/student', { iepf_refresh: 'old' }))
    expect(location(response)).toBe('/')
    expect(response.headers.get('set-cookie')).toContain('iepf_refresh=;')
  })

  it('keeps rotated tokens when the profile call fails after a refresh', async () => {
    const tokens = { accessToken: jwt('student'), tokenType: 'Bearer', expiresIn: 3600, refreshToken: 'next', refreshTokenExpiresIn: 7200 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/refresh') ? json(tokens) : json({}, 500)))
    const response = await proxy(page('/student', { iepf_refresh: 'old' }))
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toContain('iepf_refresh=next')
  })

  it('signs out when a freshly refreshed token is rejected', async () => {
    const tokens = { accessToken: jwt('student'), tokenType: 'Bearer', expiresIn: 3600, refreshToken: 'next', refreshTokenExpiresIn: 7200 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/refresh') ? json(tokens) : json({}, 401)))
    const response = await proxy(page('/student', { iepf_refresh: 'old' }))
    expect(location(response)).toBe('/')
    expect(response.headers.get('set-cookie')).toContain('iepf_access=;')
  })

  it('forwards the client address when refreshing a token', async () => {
    const tokens = { accessToken: jwt('student'), tokenType: 'Bearer', expiresIn: 3600, refreshToken: 'next', refreshTokenExpiresIn: 7200 }
    const fetchMock = vi.fn(async (url: string) => url.endsWith('/auth/refresh')
      ? json(tokens)
      : json({ role: 'student', isActive: true }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await proxy(page('/student', { iepf_refresh: 'current' }, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))
    expect(location(response)).toBeNull()
    const refreshCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/auth/refresh')) as unknown as [string, RequestInit]
    expect(refreshCall[1].headers).toMatchObject({ 'x-forwarded-for': '203.0.113.7' })
    expect(response.headers.get('set-cookie')).toContain('iepf_refresh=next')
  })
})
