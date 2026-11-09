// Purpose: Record and read how an admin changed a lesson: when, by whom, before and after.
import { and, asc, eq, sql } from 'drizzle-orm'

import type { LessonVersion } from '@/db/schemas/lesson-changes.schema'
import type { DbTransaction } from '@/lib/lesson-tokens'

import db from '@/db'
import { lessonChanges } from '@/db/schemas/lesson-changes.schema'
import { users } from '@/db/schemas/users.schema'

export async function recordLessonChange(tx: DbTransaction, params: { lessonId: string, before: LessonVersion, after: LessonVersion, actorId: string }) {
  const actor = await tx.query.users.findFirst({
    where: eq(users.id, params.actorId),
    columns: { firstName: true, lastName: true, role: true }
  })
  await tx.insert(lessonChanges).values({
    lessonId: params.lessonId,
    before: params.before,
    after: params.after,
    actorId: params.actorId,
    actorName: actor ? `${actor.firstName} ${actor.lastName}` : 'Sconosciuto',
    actorRole: actor?.role ?? 'unknown'
  })
}

export async function listLessonHistory(lessonId: string) {
  return db.select({
    id: lessonChanges.id,
    before: lessonChanges.before,
    after: lessonChanges.after,
    actorName: lessonChanges.actorName,
    actorRole: lessonChanges.actorRole,
    createdAt: lessonChanges.createdAt
  })
    .from(lessonChanges)
    .where(eq(lessonChanges.lessonId, lessonId))
    .orderBy(asc(lessonChanges.createdAt))
}

// Whether a reschedule moved the lesson away from this tutor.
export async function wasTutorOf(lessonId: string, tutorId: string) {
  const [row] = await db.select({ id: lessonChanges.id })
    .from(lessonChanges)
    .where(and(
      eq(lessonChanges.lessonId, lessonId),
      sql`${lessonChanges.before}->>'tutorId' = ${tutorId}`
    ))
    .limit(1)
  return Boolean(row)
}
