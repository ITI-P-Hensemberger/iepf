import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { proxy } from './proxy'

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
