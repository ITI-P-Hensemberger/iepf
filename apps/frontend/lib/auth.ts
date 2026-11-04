import { clientIpHeaders } from '@/lib/client-ip'
import { unwrapBackendData } from '@/lib/backend-response'

export type AuthTokens = {
  accessToken: string
  tokenType: string
  expiresIn: number
  refreshToken: string
  refreshTokenExpiresIn: number
}

export type UserProfile = {
  id?: string
  email?: string
  firstName?: string
  lastName?: string
  sectionId?: string | null
  sectionName?: string | null
  year?: number | null
  lessonTokens?: number | null
  isActive?: boolean | null
  role?: string | null
}

export const AUTH_COOKIES = {
  access: 'iepf_access',
  refresh: 'iepf_refresh',
  accessExpiresAt: 'iepf_access_expires_at',
  refreshExpiresAt: 'iepf_refresh_expires_at',
  remember: 'iepf_remember'
} as const

export const IMPERSONATION_COOKIES = {
  adminAccess: 'iepf_admin_access',
  adminRefresh: 'iepf_admin_refresh',
  adminAccessExpiresAt: 'iepf_admin_access_expires_at',
  adminRefreshExpiresAt: 'iepf_admin_refresh_expires_at',
  adminRemember: 'iepf_admin_remember',
  active: 'iepf_impersonating',
  impersonatedId: 'iepf_impersonated_id',
  impersonatedRole: 'iepf_impersonated_role',
  impersonatedEmail: 'iepf_impersonated_email'
} as const

type JwtPayload = {
  sub?: string
  userId?: string
  id?: string
  role?: string | null
  isActive?: boolean | null
}

function decodeBase64Url(input: string) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')

  if (typeof atob !== 'function') {
    throw new Error('Base64 decoder unavailable')
  }

  return atob(padded)
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const segments = token.split('.')
  if (segments.length < 2) {
    return null
  }

  try {
    const json = decodeBase64Url(segments[1])
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

export function getUserIdFromToken(accessToken: string) {
  const payload = decodeJwtPayload(accessToken)
  if (!payload) {
    return null
  }
  if (typeof payload.sub === 'string') {
    return payload.sub
  }
  if (typeof payload.userId === 'string') {
    return payload.userId
  }
  if (typeof payload.id === 'string') {
    return payload.id
  }
  return null
}

function getProfileFromToken(accessToken: string): UserProfile | null {
  const payload = decodeJwtPayload(accessToken)
  if (!payload) {
    return null
  }

  if (payload.role === 'activator') {
    return {
      role: 'activator',
      isActive: payload.isActive ?? true
    }
  }

  return null
}

function statusError(message: string, status: number) {
  const error = new Error(message)
  ;(error as Error & { status?: number }).status = status
  return error
}

// Only a 401 proves the session is invalid. Anything else (restart, 5xx, 429, network)
// is temporary and must not sign the user out.
export function isAuthRejected(error: unknown) {
  return (error as { status?: number } | null)?.status === 401
}

export async function fetchUserProfile(
  apiBaseUrl: string,
  accessToken: string,
  requestHeaders: Headers
): Promise<UserProfile> {
  const tokenProfile = getProfileFromToken(accessToken)
  if (tokenProfile) {
    return tokenProfile
  }

  const userId = getUserIdFromToken(accessToken)
  if (!userId) {
    throw statusError('Missing user id in token', 401)
  }

  const response = await fetch(`${apiBaseUrl}/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...clientIpHeaders(requestHeaders)
    }
  })

  if (!response.ok) {
    throw statusError('Failed to fetch user', response.status)
  }

  const payload = (await response.json()) as unknown
  return unwrapBackendData<UserProfile>(payload)
}

export async function loginWithProfile(
  apiBaseUrl: string,
  email: string,
  password: string,
  requestHeaders: Headers
) {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...clientIpHeaders(requestHeaders)
    },
    body: JSON.stringify({ email, password })
  })

  if (!response.ok) {
    const error = new Error('Login failed')
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  const payload = (await response.json()) as unknown
  const tokens = unwrapBackendData<AuthTokens>(payload)
  const profile = await fetchUserProfile(apiBaseUrl, tokens.accessToken, requestHeaders)

  return { tokens, profile }
}

export async function refreshWithProfile(
  apiBaseUrl: string,
  refreshToken: string,
  requestHeaders: Headers
) {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...clientIpHeaders(requestHeaders)
    },
    body: JSON.stringify({ refreshToken })
  })

  if (!response.ok) {
    throw statusError('Refresh failed', response.status)
  }

  const payload = (await response.json()) as unknown
  const tokens = unwrapBackendData<AuthTokens>(payload)

  // The old refresh token is already gone: losing these tokens would end the session,
  // so a temporary profile failure must still return them.
  try {
    const profile = await fetchUserProfile(apiBaseUrl, tokens.accessToken, requestHeaders)
    return { tokens, profile }
  } catch (error) {
    if (isAuthRejected(error)) {
      throw error
    }
    return { tokens, profile: null }
  }
}
