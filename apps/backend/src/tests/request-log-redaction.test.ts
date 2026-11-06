// Purpose: Pin that request logs never carry tokens or session cookies.
import { Hono } from 'hono'
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { pinoLogger } from '@/middlewares/pino-logger'

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6Im1hcmlvLnJvc3NpQGV4YW1wbGUudGVzdCJ9.c2lnbmF0dXJl'

function capture() {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString())
      callback()
    }
  })
  return { lines, stream }
}

describe('request log', () => {
  it('redacts the bearer token and cookies but keeps the rest of the request', async () => {
    const { lines, stream } = capture()
    const app = new Hono()
      .use(pinoLogger(stream, 'info'))
      .get('/lessons', c => c.json({ ok: true }))

    const response = await app.request('/lessons', {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Cookie': `iepf_access=${TOKEN}; iepf_refresh=secret-refresh`,
        'X-Forwarded-For': '203.0.113.7'
      }
    })
    expect(response.status).toBe(200)

    const output = lines.join('')
    // Without output the checks below would pass for nothing.
    expect(lines.length).toBeGreaterThan(0)
    expect(output).not.toContain(TOKEN)
    expect(output).not.toContain('secret-refresh')
    expect(output).not.toContain('mario.rossi')

    const entry = JSON.parse(lines.find(line => line.includes('/lessons'))!)
    expect(entry.req.headers.authorization).toBe('[redacted]')
    expect(entry.req.headers.cookie).toBe('[redacted]')
    expect(entry.req.headers['x-forwarded-for']).toBe('203.0.113.7')
    expect(entry.res.status).toBe(200)
  })
})
