// Purpose: Password hashing and verification helpers.
import argon2 from 'argon2'
import { randomBytes } from 'node:crypto'

import env from '@/env'

export async function hashPassword(password: string) {
  return argon2.hash(env.PASSWORD_SALT + password, { type: argon2.argon2id })
}

export async function verifyPassword(storedHash: string, password: string) {
  return argon2.verify(storedHash, env.PASSWORD_SALT + password)
}

// A hash nobody has the password for: verifying against it costs what a real check costs.
let dummy: Promise<string> | undefined
export function dummyHash() {
  dummy ??= hashPassword(randomBytes(16).toString('hex'))
  return dummy
}
