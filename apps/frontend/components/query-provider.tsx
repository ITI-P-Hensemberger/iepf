'use client'

import * as React from 'react'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'

// One cache for the app. A failed load shows its Italian message as a toast, once, wherever
// it happens: queries throw an Error carrying that message.
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => toast.error(error.message)
    }),
    defaultOptions: {
      // Pages refetch on mount and after a change; refetching on every tab focus would only add load.
      queries: { retry: 1, refetchOnWindowFocus: false }
    }
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
