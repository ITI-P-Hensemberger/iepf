// Purpose: The history of a feedback: every version, who wrote it, and how long it stays editable.
import { desc, eq, inArray, sql } from 'drizzle-orm'

import db from '@/db'
import { lessonFeedbackVersions } from '@/db/schemas/lesson-feedback.schema'
import { users } from '@/db/schemas/users.schema'

// Students and tutors may change their own feedback for a week after the lesson; admins always.
export const FEEDBACK_EDIT_DAYS = 7

export function feedbackEditableUntil(lessonStart: Date) {
  return new Date(lessonStart.getTime() + FEEDBACK_EDIT_DAYS * 24 * 60 * 60 * 1000)
}

export function isFeedbackEditable(lessonStart: Date, now = new Date()) {
  return now <= feedbackEditableUntil(lessonStart)
}

export type FeedbackEditorRole = 'student' | 'tutor' | 'admin'

type Executor = Pick<typeof db, 'insert'>

export async function recordFeedbackVersion(executor: Executor, version: {
  feedbackId: string
  rating: number
  text: string | null
  editorUserId: string
  editorRole: FeedbackEditorRole
}) {
  await executor.insert(lessonFeedbackVersions).values(version)
}

// A save that changes nothing is not a new version.
export function feedbackChanged(current: { rating: number, text: string | null }, next: { rating: number, text: string | null }) {
  return current.rating !== next.rating || (current.text ?? '') !== (next.text ?? '')
}

export interface FeedbackSummary { versionCount: number, lastEditorRole: string | null }

// For the lists: how many versions each feedback has, and who wrote the latest.
export async function feedbackSummaries(feedbackIds: string[]) {
  const summaries = new Map<string, FeedbackSummary>()
  if (feedbackIds.length === 0) {
    return summaries
  }
  const rows = await db.select({
    feedbackId: lessonFeedbackVersions.feedbackId,
    versionCount: sql<number>`count(*)::int`,
    lastEditorRole: sql<string>`(array_agg(${lessonFeedbackVersions.editorRole} order by ${lessonFeedbackVersions.createdAt} desc))[1]`
  })
    .from(lessonFeedbackVersions)
    .where(inArray(lessonFeedbackVersions.feedbackId, feedbackIds))
    .groupBy(lessonFeedbackVersions.feedbackId)
  for (const row of rows) {
    summaries.set(row.feedbackId, { versionCount: Number(row.versionCount), lastEditorRole: row.lastEditorRole })
  }
  return summaries
}

// Newest first. The editor's name only goes to the admins: the author reads "Tu" or "Amministratore".
export async function listFeedbackVersions(feedbackId: string, authorUserId: string, withNames: boolean) {
  const rows = await db.select({
    id: lessonFeedbackVersions.id,
    rating: lessonFeedbackVersions.rating,
    text: lessonFeedbackVersions.text,
    editorUserId: lessonFeedbackVersions.editorUserId,
    editorRole: lessonFeedbackVersions.editorRole,
    createdAt: lessonFeedbackVersions.createdAt,
    firstName: users.firstName,
    lastName: users.lastName
  })
    .from(lessonFeedbackVersions)
    .leftJoin(users, eq(users.id, lessonFeedbackVersions.editorUserId))
    .where(eq(lessonFeedbackVersions.feedbackId, feedbackId))
    .orderBy(desc(lessonFeedbackVersions.createdAt), desc(lessonFeedbackVersions.id))

  return rows.map(row => ({
    id: row.id,
    rating: row.rating,
    text: row.text ?? null,
    createdAt: row.createdAt.toISOString(),
    editorRole: row.editorRole,
    editorIsAuthor: row.editorUserId === authorUserId && row.editorRole !== 'admin',
    editorName: withNames ? fullName(row.firstName, row.lastName) : null
  }))
}

export function fullName(firstName: string | null | undefined, lastName: string | null | undefined) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim()
  return name || null
}
