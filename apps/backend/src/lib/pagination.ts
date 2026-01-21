// Purpose: Shared helpers for paginated list responses.

export interface PagedResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

export function buildPagedResponse<T>(data: T[], total: number, limit: number, offset: number): PagedResponse<T> {
  return {
    data,
    total,
    limit,
    offset
  }
}
