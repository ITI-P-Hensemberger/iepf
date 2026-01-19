// Purpose: Tutor invite token lifecycle helpers.
import { eq } from 'drizzle-orm'

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

export async function consumeTutorInviteToken(token: string) {
  const tokenHash = hashToken(token)
  const found = await db.query.tutorInviteTokens.findFirst({
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
    await db.delete(tutorInviteTokens).where(eq(tutorInviteTokens.id, found.id))
    return null
  }

  await db.delete(tutorInviteTokens).where(eq(tutorInviteTokens.id, found.id))

  return {
    email: found.email
  }
}
