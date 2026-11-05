// Purpose: Refresh token lifecycle helpers.
import { and, eq, lte } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'

import db from '@/db'
import { refreshTokens } from '@/db/schemas/refresh-tokens.schema'
import env from '@/env'

import type { AuthenticatedUser } from './types'

import { hashToken } from './token-utils'

const TOKEN_BYTE_LENGTH = 48
// Parallel requests, or a response lost on the way back, must not sign the user out.
export const ROTATION_GRACE_MS = 30_000

function buildExpiryDate() {
  return new Date(Date.now() + (env.REFRESH_TOKEN_TTL * 1000))
}

export async function issueRefreshToken(userId: string, executor: Pick<typeof db, 'insert'> = db) {
  const token = randomBytes(TOKEN_BYTE_LENGTH).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = buildExpiryDate()

  await executor.insert(refreshTokens).values({
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
  const tokenHash = hashToken(refreshToken)

  return db.transaction(async (tx) => {
    // The row lock serializes concurrent rotations of the same token.
    const [found] = await tx.select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      expiresAt: refreshTokens.expiresAt,
      rotatedAt: refreshTokens.rotatedAt
    })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .for('update')

    if (!found) {
      return null
    }

    const now = new Date()
    const graceStart = new Date(now.getTime() - ROTATION_GRACE_MS)

    if (found.expiresAt <= now) {
      await tx.delete(refreshTokens).where(eq(refreshTokens.id, found.id))
      return null
    }

    if (found.rotatedAt && found.rotatedAt <= graceStart) {
      await tx.delete(refreshTokens).where(eq(refreshTokens.id, found.id))
      return null
    }

    const user = await tx.query.users.findFirst({
      where(fields, operators) {
        return operators.eq(fields.id, found.userId)
      },
      columns: {
        id: true,
        email: true,
        role: true,
        emailVerifiedAt: true
      }
    })

    if (!user) {
      await tx.delete(refreshTokens).where(eq(refreshTokens.id, found.id))
      return null
    }

    if (!found.rotatedAt) {
      await tx.update(refreshTokens).set({ rotatedAt: now }).where(eq(refreshTokens.id, found.id))
    }

    // Keep the table bounded: rotated tokens are useless once their grace period ends.
    await tx.delete(refreshTokens).where(and(
      eq(refreshTokens.userId, found.userId),
      lte(refreshTokens.rotatedAt, graceStart)
    ))

    const next = await issueRefreshToken(found.userId, tx)

    return {
      user: user as AuthenticatedUser,
      refresh: next
    }
  })
}

export async function revokeRefreshToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken)
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash))
}

export async function revokeUserRefreshTokens(userId: string) {
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
}
