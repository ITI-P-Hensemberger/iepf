import { eq } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'

import db from '@/db'
import { refreshTokens } from '@/db/schemas/refresh-tokens.schema'
import env from '@/env'

import type { AuthenticatedUser } from './types'

const TOKEN_BYTE_LENGTH = 48

function buildExpiryDate() {
  return new Date(Date.now() + (env.REFRESH_TOKEN_TTL * 1000))
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueRefreshToken(userId: string) {
  const token = randomBytes(TOKEN_BYTE_LENGTH).toString('hex')
  const tokenHash = hashRefreshToken(token)
  const expiresAt = buildExpiryDate()

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt
  })

  return {
    token,
    expiresIn: env.REFRESH_TOKEN_TTL,
    expiresAt
  }
}

export async function rotateRefreshToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken)

  const found = await db.query.refreshTokens.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tokenHash, tokenHash)
    },
    columns: {
      id: true,
      userId: true,
      expiresAt: true
    }
  })

  if (!found) {
    return null
  }

  if (found.expiresAt <= new Date()) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, found.id))
    return null
  }

  const user = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, found.userId)
    },
    columns: {
      id: true,
      email: true,
      role: true
    }
  })

  if (!user) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, found.id))
    return null
  }

  await db.delete(refreshTokens).where(eq(refreshTokens.id, found.id))

  const next = await issueRefreshToken(found.userId)

  return {
    user: user as AuthenticatedUser,
    refresh: next
  }
}

export async function revokeUserRefreshTokens(userId: string) {
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
}
