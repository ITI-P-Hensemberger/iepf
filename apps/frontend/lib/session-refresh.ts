// The access token lives one hour and proxy.ts renews it only on page navigation. A page left
// open longer would get 401 on its next /api call, so the client renews the session there:
// one refresh shared by every call that failed together, then the call is sent once more.

type Fetch = typeof fetch

// Set by /api/auth/refresh when the browser holds no session at all, as for a visitor.
export const NO_SESSION_HEADER = 'x-iepf-session'

export type RefreshOptions = {
  origin: string
  // During impersonation there is no refresh token: refreshing would sign the admin out.
  isImpersonating: () => boolean
  onSessionLost: () => void
}

// Where a lost session sends the user: never from the auth pages themselves, which would
// reload the login page forever, and never with a `next` that is itself an auth page.
export function loginRedirect(pathname: string, search: string) {
  if (pathname.startsWith('/auth/')) return null
  return `/auth/login?next=${encodeURIComponent(`${pathname}${search}`)}`
}

// Auth routes answer 401 on purpose (wrong password, no session) and refresh by themselves.
export function needsSessionRefresh(url: URL, origin: string) {
  return url.origin === origin
    && url.pathname.startsWith('/api/')
    && !url.pathname.startsWith('/api/auth/')
}

export function createRefreshingFetch(baseFetch: Fetch, options: RefreshOptions): Fetch {
  let pending: Promise<'renewed' | 'lost' | 'none' | 'unavailable'> | null = null
  // A visitor never had a session: their 401s stay 401s until the next full page load.
  let noSession = false

  function refreshOnce() {
    pending ??= baseFetch(`${options.origin}/api/auth/refresh`, { method: 'POST', cache: 'no-store' })
      .then((response) => {
        if (response.ok) return 'renewed' as const
        if (response.status !== 401) return 'unavailable' as const
        return response.headers.get(NO_SESSION_HEADER) === 'none' ? 'none' as const : 'lost' as const
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
    if (response.status !== 401 || noSession || options.isImpersonating()) {
      return response
    }

    const outcome = await refreshOnce()
    if (outcome === 'renewed') {
      return baseFetch(retry)
    }
    if (outcome === 'none') {
      noSession = true
    }
    if (outcome === 'lost') {
      options.onSessionLost()
    }
    return response
  }
}
