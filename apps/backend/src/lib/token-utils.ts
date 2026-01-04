// Purpose: Shared token generation and hashing helpers.
import { createHash, randomBytes } from 'node:crypto'

export function generateToken(byteLength: number) {
  return randomBytes(byteLength).toString('hex')
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
