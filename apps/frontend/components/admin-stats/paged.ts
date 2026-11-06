// The backend lists come in a few shapes; the stats tables read them all the same way.

type PagedPayloadObject<T> = {
  items?: T[]
  total?: number
  data?: PagedPayloadObject<T> | T[]
  rows?: T[]
  results?: T[]
}

// The backend lists come in a few shapes: an array, or { data | items | rows | results, total }.
export function normalizePaged<T>(payload: unknown): { items: T[], total: number } {
  if (Array.isArray(payload)) {
    return { items: payload as T[], total: payload.length }
  }
  if (!payload || typeof payload !== 'object') {
    return { items: [], total: 0 }
  }
  const candidate = payload as PagedPayloadObject<T>
  const nested = candidate.data && !Array.isArray(candidate.data) ? candidate.data : undefined
  const items = [candidate.items, candidate.rows, candidate.results, candidate.data, nested?.items, nested?.rows, nested?.results]
    .find((value): value is T[] => Array.isArray(value)) ?? []
  const total = typeof candidate.total === 'number'
    ? candidate.total
    : typeof nested?.total === 'number' ? nested.total : items.length
  return { items, total }
}
