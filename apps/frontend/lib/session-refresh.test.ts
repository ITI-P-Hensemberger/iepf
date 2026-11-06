import { describe, expect, it, vi } from 'vitest'

import { createRefreshingFetch, loginRedirect, needsSessionRefresh, NO_SESSION_HEADER } from './session-refresh'

const origin = 'https://iepf.test'

type Call = { url: string, method: string, body: string }

// A fake server: answers 401 until the session is renewed, then 200 echoing the body.
function fakeServer(refreshStatus = 200, visitor = false) {
  let renewed = false
  const calls: Call[] = []
  const baseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const body = request.method === 'GET' ? '' : await request.text()
    calls.push({ url: new URL(request.url).pathname, method: request.method, body })
    if (request.url.endsWith('/api/auth/refresh')) {
      renewed = refreshStatus === 200
      return new Response(null, {
        status: refreshStatus,
        headers: visitor ? { [NO_SESSION_HEADER]: 'none' } : {}
      })
    }
    return renewed ? new Response(body || 'ok', { status: 200 }) : new Response(null, { status: 401 })
  }) as unknown as typeof fetch
  return { baseFetch, calls }
}

function setup(refreshStatus = 200, impersonating = false, visitor = false) {
  const server = fakeServer(refreshStatus, visitor)
  const onSessionLost = vi.fn()
  const wrapped = createRefreshingFetch(server.baseFetch, {
    origin,
    isImpersonating: () => impersonating,
    onSessionLost
  })
  return { ...server, wrapped, onSessionLost }
}

describe('needsSessionRefresh', () => {
  it('covers this site\'s API, except the auth routes', () => {
    expect(needsSessionRefresh(new URL(`${origin}/api/lessons/1/feedback`), origin)).toBe(true)
    expect(needsSessionRefresh(new URL(`${origin}/api/auth/login`), origin)).toBe(false)
    expect(needsSessionRefresh(new URL(`${origin}/student`), origin)).toBe(false)
    expect(needsSessionRefresh(new URL('https://other.test/api/x'), origin)).toBe(false)
  })
})

describe('createRefreshingFetch', () => {
  it('renews an expired session and sends the call again with the same body', async () => {
    const { wrapped, calls, onSessionLost } = setup()
    const response = await wrapped(`${origin}/api/lessons/1/feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating: 4 })
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"rating":4}')
    expect(calls.map(call => call.url)).toEqual([
      '/api/lessons/1/feedback',
      '/api/auth/refresh',
      '/api/lessons/1/feedback'
    ])
    expect(onSessionLost).not.toHaveBeenCalled()
  })

  it('shares one refresh among calls that failed together', async () => {
    const { wrapped, calls } = setup()
    const responses = await Promise.all([
      wrapped(`${origin}/api/a`),
      wrapped(`${origin}/api/b`),
      wrapped(`${origin}/api/c`)
    ])

    expect(responses.map(response => response.status)).toEqual([200, 200, 200])
    expect(calls.filter(call => call.url === '/api/auth/refresh')).toHaveLength(1)
  })

  it('sends the user to the login when the session cannot be renewed', async () => {
    const { wrapped, calls, onSessionLost } = setup(401)
    const response = await wrapped(`${origin}/api/a`)

    expect(response.status).toBe(401)
    expect(onSessionLost).toHaveBeenCalledOnce()
    expect(calls.filter(call => call.url === '/api/a')).toHaveLength(1)
  })

  it('keeps the session when the backend is only unavailable', async () => {
    const { wrapped, onSessionLost } = setup(503)
    expect((await wrapped(`${origin}/api/a`)).status).toBe(401)
    expect(onSessionLost).not.toHaveBeenCalled()
  })

  it('never refreshes during impersonation, nor for the auth routes', async () => {
    const impersonation = setup(200, true)
    expect((await impersonation.wrapped(`${origin}/api/a`)).status).toBe(401)
    expect(impersonation.calls).toHaveLength(1)

    const auth = setup()
    expect((await auth.wrapped(`${origin}/api/auth/login`, { method: 'POST', body: '{}' })).status).toBe(401)
    expect(auth.calls).toHaveLength(1)
  })

  it('leaves a visitor without a session where they are, and stops asking', async () => {
    const { wrapped, calls, onSessionLost } = setup(401, false, true)
    expect((await wrapped(`${origin}/api/settings/me`)).status).toBe(401)
    expect((await wrapped(`${origin}/api/settings/me`)).status).toBe(401)

    expect(onSessionLost).not.toHaveBeenCalled()
    expect(calls.filter(call => call.url === '/api/auth/refresh')).toHaveLength(1)
  })
})

describe('loginRedirect', () => {
  it('never redirects from an auth page, so the login page cannot loop', () => {
    expect(loginRedirect('/auth/login', '?next=%2Fstudent')).toBeNull()
    expect(loginRedirect('/auth/register', '')).toBeNull()
    expect(loginRedirect('/tutor/lessons/1', '?tab=feedback')).toBe('/auth/login?next=%2Ftutor%2Flessons%2F1%3Ftab%3Dfeedback')
  })
})
