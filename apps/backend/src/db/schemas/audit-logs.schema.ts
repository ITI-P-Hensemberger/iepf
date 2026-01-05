// Purpose: Audit log entries for request and admin actions.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

export const auditLogs = sqliteTable('audit_logs', {
  id: text().primaryKey().$defaultFn(() => randomUUID()),
  actorId: text(),
  actorRole: text(),
  action: text().notNull(),
  method: text().notNull(),
  path: text().notNull(),
  status: integer().notNull(),
  ip: text(),
  userAgent: text(),
  requestId: text(),
  durationMs: integer().notNull(),
  metadata: text(),
  createdAt: integer({ mode: 'timestamp' })
    .$defaultFn(() => new Date())
})
