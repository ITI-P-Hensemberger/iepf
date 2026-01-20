import { unwrapBackendData } from '@/lib/backend-response'

export type AuthTokens = {
  accessToken: string
  tokenType: string
  expiresIn: number
  refreshToken: string
  refreshTokenExpiresIn: number
}

export type UserProfile = {
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

type JwtPayload = {
  sub?: string
  userId?: string
  id?: string
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
  } catch (error) {
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

export async function fetchUserProfile(
  apiBaseUrl: string,
  accessToken: string
): Promise<UserProfile> {
  const userId = getUserIdFromToken(accessToken)
  if (!userId) {
    throw new Error('Missing user id in token')
  }

  const response = await fetch(`${apiBaseUrl}/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch user')
  }

  const payload = (await response.json()) as unknown
  return unwrapBackendData<UserProfile>(payload)
}

export async function loginWithProfile(
  apiBaseUrl: string,
  email: string,
  password: string
) {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
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
  const profile = await fetchUserProfile(apiBaseUrl, tokens.accessToken)

  return { tokens, profile }
}

export async function refreshWithProfile(
  apiBaseUrl: string,
  refreshToken: string
) {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  })

  if (!response.ok) {
    const error = new Error('Refresh failed')
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  const payload = (await response.json()) as unknown
  const tokens = unwrapBackendData<AuthTokens>(payload)
  const profile = await fetchUserProfile(apiBaseUrl, tokens.accessToken)

  return { tokens, profile }
}
