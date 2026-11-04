import { describe, expect, it } from 'vitest'

import { clientIpHeaders } from '@/lib/client-ip'

describe('clientIpHeaders', () => {
  it('passes on the first forwarded address', () => {
    expect(clientIpHeaders(new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.2' })))
      .toEqual({ 'x-forwarded-for': '203.0.113.5' })
  })

  it('falls back to x-real-ip', () => {
    expect(clientIpHeaders(new Headers({ 'x-real-ip': '203.0.113.6' })))
      .toEqual({ 'x-forwarded-for': '203.0.113.6' })
  })

  it('sends nothing when the address is unknown', () => {
    expect(clientIpHeaders(new Headers())).toEqual({})
    expect(clientIpHeaders(new Headers({ 'x-forwarded-for': ' ' }))).toEqual({})
  })
})
