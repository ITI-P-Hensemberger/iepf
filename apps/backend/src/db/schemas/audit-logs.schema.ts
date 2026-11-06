// Purpose: Audit log entries for request and admin actions.
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

export const auditLogs = pgTable('audit_logs', {
  id: uuid().primaryKey().$defaultFn(() => randomUUID()),
  actorId: uuid(),
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
  createdAt: timestamp({ mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull()
}, table => [
  index('audit_logs_created_at_idx').on(table.createdAt)
])
