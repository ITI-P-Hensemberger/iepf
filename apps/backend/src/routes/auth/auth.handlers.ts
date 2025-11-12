import type { Context } from 'hono'

import type { AppBindings, AppRouteHandler } from '@/lib/types'

import db from '@/db'
import { createAccessToken } from '@/lib/auth'
import * as HttpStatusCodes from '@/lib/http-status-codes'
import * as HttpStatusPhrases from '@/lib/http-status-phrases'
import { verifyPassword } from '@/lib/password'
import { issueRefreshToken, rotateRefreshToken } from '@/lib/refresh-tokens'

import type { LoginRoute, RefreshRoute } from './auth.routes'

function unauthorized(c: Context<AppBindings>) {
  return c.json(
    { message: HttpStatusPhrases.UNAUTHORIZED },
    HttpStatusCodes.UNAUTHORIZED
  )
}

export const login: AppRouteHandler<LoginRoute> = async (c) => {
  const credentials = c.req.valid('json')
  const user = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.email, credentials.email)
    },
    columns: {
      id: true,
      email: true,
      role: true,
      passwordHash: true
    }
  })

  if (!user) {
    return unauthorized(c)
  }

  const isValid = await verifyPassword(user.passwordHash, credentials.password)

  if (!isValid) {
    return unauthorized(c)
  }

  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken({
      id: user.id,
      email: user.email,
      role: user.role
    }),
    issueRefreshToken(user.id)
  ])

  return c.json(
    {
      accessToken: accessToken.token,
      tokenType: 'Bearer' as const,
      expiresIn: accessToken.expiresIn,
      refreshToken: refreshToken.token,
      refreshTokenExpiresIn: refreshToken.expiresIn
    },
    HttpStatusCodes.OK
  )
}

export const refreshTokensHandler: AppRouteHandler<RefreshRoute> = async (c) => {
  const payload = c.req.valid('json')
  const rotation = await rotateRefreshToken(payload.refreshToken)

  if (!rotation) {
    return unauthorized(c)
  }

  const accessToken = await createAccessToken({
    id: rotation.user.id,
    email: rotation.user.email,
    role: rotation.user.role
  })

  return c.json(
    {
      accessToken: accessToken.token,
      tokenType: 'Bearer' as const,
      expiresIn: accessToken.expiresIn,
      refreshToken: rotation.refresh.token,
      refreshTokenExpiresIn: rotation.refresh.expiresIn
    },
    HttpStatusCodes.OK
  )
}
