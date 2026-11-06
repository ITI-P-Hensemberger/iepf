import { forwardToBackend } from '@/lib/backend-proxy'

// Only the paging parameters reach the backend.
export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams
  const params = new URLSearchParams()
  for (const key of ['cursor', 'limit']) {
    const value = incoming.get(key)
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return forwardToBackend(`/notifications/inbox${query ? `?${query}` : ''}`)
}
