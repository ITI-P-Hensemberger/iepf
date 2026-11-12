// Purpose: Record and read who turned an account on or off, when and why.
import { asc, eq } from 'drizzle-orm'

import db from '@/db'
import { activationEvents } from '@/db/schemas/activation-events.schema'
import { users } from '@/db/schemas/users.schema'

// actorId is null only when nobody is known (an invite sent before inviters were recorded).
export async function recordActivationChange(params: { userId: string, isActive: boolean, reason: string | null, actorId: string | null }) {
  const [actor, earlier] = await Promise.all([
    params.actorId
      ? db.query.users.findFirst({
          where: eq(users.id, params.actorId),
          columns: { firstName: true, lastName: true, role: true }
        })
      : null,
    db.query.activationEvents.findFirst({
      where: eq(activationEvents.userId, params.userId),
      columns: { id: true }
    })
  ])
  // Any earlier event means the account went through this before: turning it on is a reactivation.
  const kind = !params.isActive
    ? 'deactivated'
    : earlier ? 'reactivated' : 'activated'
  await db.insert(activationEvents).values({
    userId: params.userId,
    kind,
    reason: params.isActive ? null : params.reason,
    actorId: params.actorId,
    actorName: actor
      ? `${actor.firstName} ${actor.lastName}`
      : 'Sconosciuto',
    actorRole: actor?.role ?? 'unknown'
  })
}

export async function listActivationHistory(userId: string) {
  return db.select({
    id: activationEvents.id,
    kind: activationEvents.kind,
    reason: activationEvents.reason,
    actorName: activationEvents.actorName,
    actorRole: activationEvents.actorRole,
    createdAt: activationEvents.createdAt
  })
    .from(activationEvents)
    .where(eq(activationEvents.userId, userId))
    .orderBy(asc(activationEvents.createdAt))
}
