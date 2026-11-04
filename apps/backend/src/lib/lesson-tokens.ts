// Purpose: Token ledger balance helpers and locks for booking invariants.
import { asc, eq, inArray, sql } from 'drizzle-orm'

import db from '@/db'
import { tokenLedger } from '@/db/schemas/token-ledger.schema'
import { users } from '@/db/schemas/users.schema'

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type DbExecutor = typeof db | DbTransaction

const balanceExpression = sql<number>`coalesce(sum(${tokenLedger.delta}), 0)`

export async function getStudentTokenBalance(studentId: string, executor: DbExecutor = db): Promise<number> {
  const [row] = await executor
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

// Balances and daily limits span many rows, so writers serialize on the users involved.
// Ordered locking avoids deadlocks; NO KEY UPDATE does not block foreign-key inserts.
export async function lockUsers(tx: DbTransaction, userIds: string[]) {
  await tx.select({ id: users.id })
    .from(users)
    .where(inArray(users.id, [...new Set(userIds)]))
    .orderBy(asc(users.id))
    .for('no key update')
}
