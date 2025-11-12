import argon2 from 'argon2'

import env from '@/env'

export async function hashPassword(password: string) {
  return argon2.hash(env.PASSWORD_SALT + password, { type: argon2.argon2id })
}

export async function verifyPassword(storedHash: string, password: string) {
  return argon2.verify(storedHash, env.PASSWORD_SALT + password)
}
