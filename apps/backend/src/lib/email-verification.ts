// Purpose: Email verification token lifecycle helpers.
import { eq } from 'drizzle-orm'

import db from '@/db'
import { emailVerificationTokens } from '@/db/schemas/email-verification-tokens.schema'
import env from '@/env'

import { generateToken, hashToken } from './token-utils'

const TOKEN_BYTE_LENGTH = 32

function buildExpiryDate() {
  return new Date(Date.now() + (env.EMAIL_VERIFICATION_TTL * 1000))
}

export async function issueEmailVerificationToken(userId: string, executor: Pick<typeof db, 'insert'> = db) {
  const token = generateToken(TOKEN_BYTE_LENGTH)
  const tokenHash = hashToken(token)
  const expiresAt = buildExpiryDate()

  await executor.insert(emailVerificationTokens).values({
    userId,
    tokenHash,
    expiresAt
  })

  return {
    token,
    expiresIn: env.EMAIL_VERIFICATION_TTL,
    expiresAt
  }
}

export async function consumeEmailVerificationToken(token: string) {
  const tokenHash = hashToken(token)
  const found = await db.query.emailVerificationTokens.findFirst({
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
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, found.id))
    return null
  }

  const user = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.id, found.userId)
    },
    columns: {
      id: true,
      email: true,
      emailVerifiedAt: true
    }
  })

  if (!user) {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, found.id))
    return null
  }

  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, found.id))

  return user
}
