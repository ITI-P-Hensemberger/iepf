// Purpose: JWT access token creation and verification helpers.
import { sign, verify } from 'hono/jwt'
import { randomUUID } from 'node:crypto'

import env from '@/env'

import type { AuthenticatedUser } from './types'

export interface AccessTokenPayload {
  [key: string]: string | number | undefined
  sub: string
  email: string
  role: string
  impersonatedById?: string
  impersonatedByEmail?: string
  impersonatedByRole?: string
  exp: number
  iss: string
  iat: number
  jti: string
}

const ISSUER = 'iepf-backend'

export async function createAccessToken(user: AuthenticatedUser) {
  const expiresIn = env.ACCESS_TOKEN_TTL
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    iss: ISSUER,
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID()
  }

  const token = await sign(payload, env.JWT_SECRET)
  return {
    token,
    expiresIn
  }
}

export async function createImpersonationToken(admin: AuthenticatedUser, target: AuthenticatedUser) {
  const expiresIn = env.IMPERSONATION_TOKEN_TTL
  const payload: AccessTokenPayload = {
    sub: target.id,
    email: target.email,
    role: target.role,
    impersonatedById: admin.id,
    impersonatedByEmail: admin.email,
    impersonatedByRole: admin.role,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    iss: ISSUER,
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID()
  }

  const token = await sign(payload, env.JWT_SECRET)
  return {
    token,
    expiresIn
  }
}

export async function verifyAccessToken(token: string) {
  const payload = await verify(token, env.JWT_SECRET, 'HS256') as Partial<AccessTokenPayload>

  if (!payload?.sub || !payload.email || !payload.role || !payload.exp || !payload.jti) {
    throw new Error('Payload del token di accesso non valido')
  }

  return payload as AccessTokenPayload
}
