import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST as refresh } from './refresh/route'
import { GET as session } from './session/route'

const cookieJar = vi.hoisted(() => new Map<string, string>())

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name)
      return value === undefined ? undefined : { name, value }
    }
  })
}))

const tokens = { accessToken: 'a.e30.c', tokenType: 'Bearer', expiresIn: 3600, refreshToken: 'next', refreshTokenExpiresIn: 7200 }

function jwt(sub: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ sub })}.signature`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function backend(answers: { refresh: () => Response, profile?: () => Response }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/refresh')
    ? answers.refresh()
    : (answers.profile ?? (() => json({ role: 'student', isActive: true })))()))
}

const issued = () => json({ ...tokens, accessToken: jwt('student') })
const request = () => new Request('https://iepf.test/api/auth', { method: 'POST' })

afterEach(() => {
  vi.unstubAllGlobals()
  cookieJar.clear()
})

describe('POST /api/auth/refresh', () => {
  it('rotates the cookies on success', async () => {
    cookieJar.set('iepf_refresh', 'old')
    backend({ refresh: issued })
    const response = await refresh(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ role: 'student', isActive: true })
    expect(response.headers.get('set-cookie')).toContain('iepf_refresh=next')
  })

  it('clears the cookies when the backend rejects the token', async () => {
    cookieJar.set('iepf_refresh', 'old')
    backend({ refresh: () => json({}, 401) })
    const response = await refresh(request())
    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toContain('iepf_refresh=;')
  })

  it.each([429, 500, 503])('keeps the cookies when the backend answers %i', async (status) => {
    cookieJar.set('iepf_refresh', 'old')
    backend({ refresh: () => json({}, status) })
    const response = await refresh(request())
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('keeps the rotated tokens when the profile call fails', async () => {
    cookieJar.set('iepf_refresh', 'old')
    backend({ refresh: issued, profile: () => json({}, 500) })
    const response = await refresh(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ role: null, isActive: false })
    expect(response.headers.get('set-cookie')).toContain('iepf_refresh=next')
  })
})

describe('GET /api/auth/session', () => {
  it('returns the profile and saves rotated tokens', async () => {
    cookieJar.set('iepf_refresh', 'old')
    backend({ refresh: issued })
    const response = await session(request())
    expect(await response.json()).toEqual({ role: 'student', isActive: true })
    expect(response.headers.get('set-cookie')).toContain('iepf_refresh=next')
  })

  it('saves rotated tokens even when the profile call fails', async () => {
    cookieJar.set('iepf_refresh', 'old')
    backend({ refresh: issued, profile: () => json({}, 500) })
    const response = await session(request())
    expect(await response.json()).toBeNull()
    expect(response.headers.get('set-cookie')).toContain('iepf_refresh=next')
  })

  it('never touches the cookies when the backend fails', async () => {
    cookieJar.set('iepf_refresh', 'old')
    backend({ refresh: () => json({}, 500) })
    const response = await session(request())
    expect(await response.json()).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
