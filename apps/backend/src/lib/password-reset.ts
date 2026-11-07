// Purpose: Password reset token lifecycle helpers.
import { eq } from 'drizzle-orm'

import db from '@/db'
import { passwordResetTokens } from '@/db/schemas/password-reset-tokens.schema'
import env from '@/env'

import { generateToken, hashToken } from './token-utils'

const TOKEN_BYTE_LENGTH = 32

function buildExpiryDate() {
  return new Date(Date.now() + (env.PASSWORD_RESET_TTL * 1000))
}

export async function issuePasswordResetToken(userId: string) {
  const token = generateToken(TOKEN_BYTE_LENGTH)
  const tokenHash = hashToken(token)
  const expiresAt = buildExpiryDate()

  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt
  })

  return {
    token,
    expiresIn: env.PASSWORD_RESET_TTL,
    expiresAt
  }
}

// Whose link this is, without using it up: null when unknown or expired.
export async function passwordResetTokenOwner(token: string) {
  const found = await db.query.passwordResetTokens.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tokenHash, hashToken(token))
    },
    columns: { userId: true, expiresAt: true }
  })
  return found && found.expiresAt > new Date() ? found.userId : null
}

export async function consumePasswordResetToken(token: string) {
  const tokenHash = hashToken(token)
  const found = await db.query.passwordResetTokens.findFirst({
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
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, found.id))
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
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, found.id))
    return null
  }

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, found.id))

  return user
}
