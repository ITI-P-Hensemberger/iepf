// The access token lives one hour and proxy.ts renews it only on page navigation. A page left
// open longer would get 401 on its next /api call, so the client renews the session there:
// one refresh shared by every call that failed together, then the call is sent once more.

type Fetch = typeof fetch

export type RefreshOptions = {
  origin: string
  // During impersonation there is no refresh token: refreshing would sign the admin out.
  isImpersonating: () => boolean
  onSessionLost: () => void
}

// Auth routes answer 401 on purpose (wrong password, no session) and refresh by themselves.
export function needsSessionRefresh(url: URL, origin: string) {
  return url.origin === origin
    && url.pathname.startsWith('/api/')
    && !url.pathname.startsWith('/api/auth/')
}

export function createRefreshingFetch(baseFetch: Fetch, options: RefreshOptions): Fetch {
  let pending: Promise<'renewed' | 'lost' | 'unavailable'> | null = null

  function refreshOnce() {
    pending ??= baseFetch(`${options.origin}/api/auth/refresh`, { method: 'POST', cache: 'no-store' })
      .then((response) => {
        if (response.ok) return 'renewed' as const
        return response.status === 401 ? 'lost' as const : 'unavailable' as const
      })
      .catch(() => 'unavailable' as const)
      .finally(() => {
        pending = null
      })
    return pending
  }

  return async (input, init) => {
    const request = new Request(input, init)
    if (!needsSessionRefresh(new URL(request.url), options.origin)) {
      return baseFetch(request)
    }

    // Kept before the first send: a body can be read only once.
    const retry = request.clone()
    const response = await baseFetch(request)
    if (response.status !== 401 || options.isImpersonating()) {
      return response
    }

    const outcome = await refreshOnce()
    if (outcome === 'renewed') {
      return baseFetch(retry)
    }
    if (outcome === 'lost') {
      options.onSessionLost()
    }
    return response
  }
}
