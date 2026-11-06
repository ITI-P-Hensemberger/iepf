import { describe, expect, it, vi } from 'vitest'

import {
  createEventParser,
  readUnreadStream,
  reconnectDelay,
  type ServerEvent,
  watchUnread
} from './notification-stream'

function streamResponse(chunks: string[], status = 200) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    }
  })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('createEventParser', () => {
  it('joins events split across chunks and skips comments', () => {
    const events: ServerEvent[] = []
    const parse = createEventParser(event => events.push(event))
    parse('event: unr')
    parse('ead\ndata: {"count":2}\n')
    parse('\n: ping\n\nevent: unread\r\ndata: {"count":3}\r\n\r\n')
    expect(events).toEqual([
      { event: 'unread', data: '{"count":2}' },
      { event: 'unread', data: '{"count":3}' }
    ])
  })

  it('waits for the blank line that ends an event', () => {
    const events: ServerEvent[] = []
    const parse = createEventParser(event => events.push(event))
    parse('data: a\n')
    expect(events).toEqual([])
    parse('data: b\n\n')
    expect(events).toEqual([{ event: 'message', data: 'a\nb' }])
  })
})

describe('readUnreadStream', () => {
  it('reports every count until the server closes the stream', async () => {
    const counts: number[] = []
    const fetchImpl = vi.fn(async () => streamResponse([
      'event: unread\ndata: {"count":1}\n\n',
      ': ping\n\nevent: other\ndata: {"count":9}\n\n',
      'event: unread\ndata: not json\n\nevent: unread\ndata: {"count":0}\n\n'
    ])) as unknown as typeof fetch
    const outcome = await readUnreadStream(count => counts.push(count), new AbortController().signal, fetchImpl)
    expect(outcome).toBe('ended')
    expect(counts).toEqual([1, 0])
  })

  it.each([[401, 'unauthorized'], [403, 'unauthorized'], [404, 'unavailable'], [503, 'unavailable']])(
    'answers %i with %s',
    async (status, expected) => {
      const fetchImpl = vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch
      expect(await readUnreadStream(() => undefined, new AbortController().signal, fetchImpl)).toBe(expected)
    }
  )
})

describe('reconnectDelay', () => {
  it('doubles from 5 seconds up to 5 minutes, spread over the upper half', () => {
    expect(reconnectDelay(1, () => 0)).toBe(2_500)
    expect(reconnectDelay(1, () => 1)).toBe(5_000)
    expect(reconnectDelay(2, () => 1)).toBe(10_000)
    expect(reconnectDelay(20, () => 1)).toBe(300_000)
  })
})

describe('watchUnread', () => {
  it('reopens a stream the server closed, and stops when told to', async () => {
    const counts: number[] = []
    const waits: number[] = []
    let stop = () => {}
    const fetchImpl = vi.fn(async () => streamResponse([`event: unread\ndata: {"count":${counts.length}}\n\n`])) as unknown as typeof fetch
    await new Promise<void>((resolve) => {
      stop = watchUnread({
        onCount: (count) => {
          counts.push(count)
          if (counts.length === 3) {
            stop()
            resolve()
          }
        },
        fetchImpl,
        wait: async (ms) => {
          waits.push(ms)
        }
      })
    })
    expect(counts).toEqual([0, 1, 2])
    // Each reopening after a working stream waits only a moment.
    expect(waits.every(ms => ms < 3_000)).toBe(true)
  })

  it('backs off while the stream is unavailable, and gives up on unauthorized', async () => {
    const waits: number[] = []
    const answers = [503, 503, 401]
    const fetchImpl = vi.fn(async () => new Response(null, { status: answers.shift() })) as unknown as typeof fetch
    watchUnread({
      onCount: () => undefined,
      fetchImpl,
      wait: async (ms) => {
        waits.push(ms)
      }
    })
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(waits).toHaveLength(2)
    expect(waits[0]).toBeGreaterThanOrEqual(2_500)
    expect(waits[1]).toBeGreaterThanOrEqual(5_000)
  })
})
