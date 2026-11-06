// Follows the unread count over Server-Sent Events while the page is visible.
// Read with fetch rather than EventSource: fetch shows the status, and the session-refresh
// wrapper renews an expired session on a 401 before the stream is opened again.

export const NOTIFICATION_STREAM_PATH = '/api/notifications/inbox/stream'

export type ServerEvent = { event: string, data: string }

// Splits a text/event-stream into events, whatever the chunk boundaries.
export function createEventParser(onEvent: (event: ServerEvent) => void) {
  let buffer = ''
  return (chunk: string) => {
    // The backend ends lines with \n alone; a stray \r is dropped.
    buffer += chunk.replace(/\r/g, '')
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        // Empty lines and comments, such as the heartbeat, carry nothing.
        if (!line || line.startsWith(':')) continue
        const colon = line.indexOf(':')
        const field = colon === -1 ? line : line.slice(0, colon)
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'event') event = value
        else if (field === 'data') data.push(value)
      }
      if (data.length > 0) onEvent({ event, data: data.join('\n') })
      boundary = buffer.indexOf('\n\n')
    }
  }
}

// ended: the server closed it, as when the access token expires; unauthorized: no session
// to follow, or impersonation that cannot be renewed; unavailable: try again later.
export type StreamOutcome = 'ended' | 'unauthorized' | 'unavailable'

type Fetch = typeof fetch

// The global fetch looked up at each call, so the session-refresh wrapper is used once installed.
const pageFetch: Fetch = (input, init) => fetch(input, init)

export async function readUnreadStream(
  onCount: (count: number) => void,
  signal: AbortSignal,
  fetchImpl: Fetch = pageFetch
): Promise<StreamOutcome> {
  const response = await fetchImpl(NOTIFICATION_STREAM_PATH, {
    cache: 'no-store',
    headers: { Accept: 'text/event-stream' },
    signal
  })
  if (response.status === 401 || response.status === 403) return 'unauthorized'
  if (!response.ok || !response.body) return 'unavailable'

  const parse = createEventParser(({ event, data }) => {
    if (event !== 'unread') return
    try {
      const count = (JSON.parse(data) as { count?: unknown }).count
      if (typeof count === 'number') onCount(count)
    } catch {
      // A malformed event is skipped; the next one carries the whole count again.
    }
  })
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) return 'ended'
    parse(value)
  }
}

// Doubles from 5 seconds up to 5 minutes, spread at random so a restarted server is not hit
// by every page at once.
export function reconnectDelay(failures: number, random = Math.random) {
  const ceiling = Math.min(5_000 * 2 ** Math.max(0, failures - 1), 300_000)
  return ceiling / 2 + random() * ceiling / 2
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

type WatchOptions = {
  onCount: (count: number) => void
  fetchImpl?: Fetch
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
}

// Keeps a stream open, reconnecting after it ends or fails, until the returned stop is called.
// After `unauthorized` it gives up: the page goes back to refreshing on focus and on push.
export function watchUnread({ onCount, fetchImpl = pageFetch, wait = sleep }: WatchOptions) {
  const controller = new AbortController()
  const { signal } = controller

  void (async () => {
    let failures = 0
    while (!signal.aborted) {
      let received = false
      let outcome: StreamOutcome
      try {
        outcome = await readUnreadStream((count) => {
          received = true
          failures = 0
          onCount(count)
        }, signal, fetchImpl)
      } catch {
        outcome = 'unavailable'
      }
      if (signal.aborted || outcome === 'unauthorized') return
      // A stream that worked and was closed by the server reopens at once, with a little
      // spread; one that never sent a count counts as a failure.
      if (outcome === 'ended' && received) {
        await wait(500 + Math.random() * 2_000, signal)
      } else {
        failures += 1
        await wait(reconnectDelay(failures), signal)
      }
    }
  })()

  return () => controller.abort()
}
