'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-fetch'

// GETs a JSON endpoint whenever the URL changes. The previous data stays available while the
// next URL loads, so tables keep their rows during paging; a failure shows as a toast.
export function useJson<T>(url: string | null, errorMessage: string) {
  const query = useQuery({
    queryKey: ['admin-stats', url],
    queryFn: () => apiFetch<T>(url ?? '', errorMessage),
    enabled: url !== null,
    placeholderData: keepPreviousData
  })
  return {
    data: query.data,
    loading: url !== null && (query.isPending || query.isPlaceholderData)
  }
}
