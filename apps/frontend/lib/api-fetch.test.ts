import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch, jsonBody } from './api-fetch'

function respond(status: number, body: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
}

describe('apiFetch', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the JSON body', async () => {
    respond(200, '{"data":[1]}')
    await expect(apiFetch('/api/x', 'Errore.')).resolves.toEqual({ data: [1] })
  })

  it('throws the backend message, or the fallback when there is none', async () => {
    respond(400, '{"message":"Lezione piena."}')
    await expect(apiFetch('/api/x', 'Errore.')).rejects.toThrow('Lezione piena.')
    respond(500, 'not json')
    await expect(apiFetch('/api/x', 'Errore.')).rejects.toThrow('Errore.')
  })

  it('throws the fallback when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(apiFetch('/api/x', 'Errore.')).rejects.toThrow('Errore.')
  })
})

describe('jsonBody', () => {
  it('sends JSON only when there is a body', () => {
    expect(jsonBody('DELETE')).toEqual({ method: 'DELETE' })
    expect(jsonBody('PATCH', { a: 1 })).toEqual({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' })
  })
})
