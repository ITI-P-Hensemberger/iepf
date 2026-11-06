import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'

const cookieJar = vi.hoisted(() => new Map<string, string>())

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name)
      return value === undefined ? undefined : { name, value }
    }
  }),
  headers: async () => new Headers()
}))

const request = () => new Request('https://iepf.test/api/notifications/inbox/stream')

afterEach(() => {
  vi.unstubAllGlobals()
  cookieJar.clear()
})

describe('GET /api/notifications/inbox/stream', () => {
  it('answers 401 without calling the backend when there is no session', async () => {
    const backend = vi.fn()
    vi.stubGlobal('fetch', backend)
    expect((await GET(request())).status).toBe(401)
    expect(backend).not.toHaveBeenCalled()
  })

  it('passes the stream through with the user token and the browser signal', async () => {
    cookieJar.set('iepf_access', 'token')
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: unread\ndata: {"count":4}\n\n'))
        controller.close()
      }
    })
    const backend = vi.fn(async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', backend)

    const incoming = request()
    const response = await GET(incoming)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(await response.text()).toBe('event: unread\ndata: {"count":4}\n\n')

    const [url, init] = backend.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/notifications\/inbox\/stream$/)
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token')
    expect(init.signal).toBe(incoming.signal)
  })

  it.each([401, 403, 503])('forwards a backend %i', async (status) => {
    cookieJar.set('iepf_access', 'token')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: { message: 'No' } }), { status })))
    expect((await GET(request())).status).toBe(status)
  })

  it('answers 503 when the backend cannot be reached', async () => {
    cookieJar.set('iepf_access', 'token')
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    expect((await GET(request())).status).toBe(503)
  })
})
