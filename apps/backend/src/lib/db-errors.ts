// Purpose: Recognize PostgreSQL errors, which Drizzle may wrap in its own error type.
export function isUniqueConstraintError(error: unknown): boolean {
  const code = (candidate: unknown) => (candidate as { code?: string } | null)?.code
  return code(error) === '23505' || code((error as { cause?: unknown } | null)?.cause) === '23505'
}
