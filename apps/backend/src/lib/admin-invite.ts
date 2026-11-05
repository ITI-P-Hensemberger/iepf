// Purpose: Admin invite token lifecycle helpers.
import { eq } from 'drizzle-orm'

import type { Transaction } from '@/db'

import db from '@/db'
import { adminInviteTokens } from '@/db/schemas/admin-invite-tokens.schema'
import env from '@/env'

import { generateToken, hashToken } from './token-utils'

const TOKEN_BYTE_LENGTH = 32

function buildExpiryDate() {
  return new Date(Date.now() + (env.ADMIN_INVITE_TTL * 1000))
}

export async function issueAdminInviteToken(email: string) {
  const token = generateToken(TOKEN_BYTE_LENGTH)
  const tokenHash = hashToken(token)
  const expiresAt = buildExpiryDate()

  await db.delete(adminInviteTokens).where(eq(adminInviteTokens.email, email))

  await db.insert(adminInviteTokens).values({
    email,
    tokenHash,
    expiresAt
  })

  return {
    token,
    expiresIn: env.ADMIN_INVITE_TTL,
    expiresAt
  }
}

// Locks the invite until the transaction ends, so it is spent only if the account is created.
export async function lockAdminInviteToken(token: string, tx: Transaction) {
  const [found] = await tx.select({
    id: adminInviteTokens.id,
    email: adminInviteTokens.email,
    expiresAt: adminInviteTokens.expiresAt
  })
    .from(adminInviteTokens)
    .where(eq(adminInviteTokens.tokenHash, hashToken(token)))
    .for('update')

  if (!found) {
    return null
  }

  if (found.expiresAt <= new Date()) {
    await tx.delete(adminInviteTokens).where(eq(adminInviteTokens.id, found.id))
    return null
  }

  return { id: found.id, email: found.email }
}
