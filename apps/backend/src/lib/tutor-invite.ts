// Purpose: Tutor invite token lifecycle helpers.
import { eq } from 'drizzle-orm'

import type { Transaction } from '@/db'

import db from '@/db'
import { tutorInviteTokens } from '@/db/schemas/tutor-invite-tokens.schema'
import env from '@/env'

import { generateToken, hashToken } from './token-utils'

const TOKEN_BYTE_LENGTH = 32

function buildExpiryDate() {
  return new Date(Date.now() + (env.TUTOR_INVITE_TTL * 1000))
}

export async function issueTutorInviteToken(email: string) {
  const token = generateToken(TOKEN_BYTE_LENGTH)
  const tokenHash = hashToken(token)
  const expiresAt = buildExpiryDate()

  await db.delete(tutorInviteTokens).where(eq(tutorInviteTokens.email, email))

  await db.insert(tutorInviteTokens).values({
    email,
    tokenHash,
    expiresAt
  })

  return {
    token,
    expiresIn: env.TUTOR_INVITE_TTL,
    expiresAt
  }
}

// Locks the invite until the transaction ends, so it is spent only if the account is created.
export async function lockTutorInviteToken(token: string, tx: Transaction) {
  const [found] = await tx.select({
    id: tutorInviteTokens.id,
    email: tutorInviteTokens.email,
    expiresAt: tutorInviteTokens.expiresAt
  })
    .from(tutorInviteTokens)
    .where(eq(tutorInviteTokens.tokenHash, hashToken(token)))
    .for('update')

  if (!found) {
    return null
  }

  if (found.expiresAt <= new Date()) {
    await tx.delete(tutorInviteTokens).where(eq(tutorInviteTokens.id, found.id))
    return null
  }

  return { id: found.id, email: found.email }
}
