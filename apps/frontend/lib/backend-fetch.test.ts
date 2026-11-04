import { afterEach, describe, expect, it, vi } from 'vitest'

import { backendFetch } from '@/lib/backend-fetch'

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }))

vi.mock('next/headers', () => ({
  headers: async () => requestHeaders.current
}))

function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sentHeaders(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls[0][1]?.headers as Headers
}

describe('backendFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds the client address and keeps the call options', async () => {
    requestHeaders.current = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })
    const fetchMock = stubFetch()
    await backendFetch('http://backend/lessons', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: '{}'
    })
    expect(fetchMock.mock.calls[0][0]).toBe('http://backend/lessons')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{}' })
    expect(sentHeaders(fetchMock).get('x-forwarded-for')).toBe('203.0.113.9')
    expect(sentHeaders(fetchMock).get('authorization')).toBe('Bearer token')
  })

  it('adds nothing when the client address is unknown', async () => {
    requestHeaders.current = new Headers()
    const fetchMock = stubFetch()
    await backendFetch('http://backend/lessons')
    expect(sentHeaders(fetchMock).has('x-forwarded-for')).toBe(false)
  })
})
