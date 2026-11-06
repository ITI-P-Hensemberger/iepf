// Maintenance takes over every page, except the login (so an admin can sign in and turn it
// off) and the FAQ, which the maintenance page links to.
export const MAINTENANCE_PATH = '/maintenance'
export const MAINTENANCE_OPEN_PATHS = ['/auth/login', '/faq']

export type MaintenanceState = {
  enabled: boolean
  message: string | null
  roles: string[]
}

export function isMaintenanceOpenPath(pathname: string) {
  return MAINTENANCE_OPEN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
}

// Visitors who are not signed in have no role: maintenance reaches them whenever it is on.
// Admins and activators are never held back; students and tutors only when their role is listed.
export function maintenanceApplies(state: MaintenanceState | null, role: string | null) {
  if (!state?.enabled) {
    return false
  }
  if (role === null) {
    return true
  }
  return (role === 'student' || role === 'tutor') && state.roles.includes(role)
}

const CACHE_MS = 10_000
let cached: { state: MaintenanceState | null, at: number } | null = null

// Read on every navigation, so it is kept for a few seconds. If the backend cannot answer,
// the pages stay open: the session checks already handle a backend that is down.
export async function readMaintenance(apiBaseUrl: string, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  if (cached && now - cached.at < CACHE_MS) {
    return cached.state
  }
  let state: MaintenanceState | null = null
  try {
    const response = await fetchImpl(`${apiBaseUrl}/maintenance`, { cache: 'no-store' })
    if (response.ok) {
      const data = await response.json() as Partial<MaintenanceState>
      state = {
        enabled: data.enabled === true,
        message: typeof data.message === 'string' ? data.message : null,
        roles: Array.isArray(data.roles) ? data.roles : []
      }
    }
  }
  catch {
    state = null
  }
  cached = { state, at: now }
  return state
}

export function resetMaintenanceCache() {
  cached = null
}
