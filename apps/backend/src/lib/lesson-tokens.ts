// Purpose: Token ledger balance helpers.
import { eq, inArray, sql } from 'drizzle-orm'

import db from '@/db'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'

const balanceExpression = sql<number>`coalesce(sum(${tokenLedger.delta}), 0)`

export async function getStudentTokenBalance(studentId: string): Promise<number> {
  const [row] = await db
    .select({ balance: balanceExpression })
    .from(tokenLedger)
    .where(eq(tokenLedger.studentId, studentId))

  return Number(row?.balance ?? 0)
}

export async function getStudentTokenBalances(studentIds: string[]): Promise<Map<string, number>> {
  if (studentIds.length === 0) {
    return new Map()
  }

  const rows = await db
    .select({
      studentId: tokenLedger.studentId,
      balance: balanceExpression
    })
    .from(tokenLedger)
    .where(inArray(tokenLedger.studentId, studentIds))
    .groupBy(tokenLedger.studentId)

  return new Map(rows.map(row => [row.studentId, Number(row.balance)]))
}
