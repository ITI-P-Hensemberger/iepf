// A call to the app's own /api routes for queries and mutations: the JSON body on success,
// otherwise an Error with the backend's Italian message, or the fallback when it has none.
// The query provider shows that message as a toast.
export async function apiFetch<T = unknown>(url: string, fallback: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init).catch(() => {
    throw new Error(fallback)
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof payload?.message === 'string' && payload.message ? payload.message : fallback)
  }
  return payload as T
}

// JSON request options for a mutation.
export function jsonBody(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}
