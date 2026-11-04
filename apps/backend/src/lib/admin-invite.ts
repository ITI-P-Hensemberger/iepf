// Purpose: Admin invite token lifecycle helpers.
import { eq } from 'drizzle-orm'

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

export async function consumeAdminInviteToken(token: string) {
  const tokenHash = hashToken(token)
  const found = await db.query.adminInviteTokens.findFirst({
    where(fields, operators) {
      return operators.eq(fields.tokenHash, tokenHash)
    },
    columns: {
      id: true,
      email: true,
      expiresAt: true
    }
  })

  if (!found) {
    return null
  }

  if (found.expiresAt <= new Date()) {
    await db.delete(adminInviteTokens).where(eq(adminInviteTokens.id, found.id))
    return null
  }

  await db.delete(adminInviteTokens).where(eq(adminInviteTokens.id, found.id))

  return {
    email: found.email
  }
}
