'use client'

import * as React from 'react'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'

// One cache for the app. A failed load or change shows its Italian message as a toast, once,
// wherever it happens: queries and mutations throw an Error carrying it (lib/api-fetch.ts).
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => toast.error(error.message)
    }),
    mutationCache: new MutationCache({
      onError: (error) => toast.error(error.message)
    }),
    defaultOptions: {
      // Pages refetch on mount and after a change; refetching on every tab focus would only add load.
      queries: { retry: 1, refetchOnWindowFocus: false }
    }
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
