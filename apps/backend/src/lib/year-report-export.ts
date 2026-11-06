// Purpose: Remembers the last year report an admin downloaded. The school-year reset deletes
// every student and tutor, so it is refused until the same admin has just saved the report.
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import db from '@/db'
import { globalSettings } from '@/db/schemas/global-settings.schema'

const KEY = 'yearReportExport'
export const REPORT_VALID_MINUTES = 15

const exportSchema = z.object({ adminId: z.string(), at: z.iso.datetime() })

export async function recordReportExport(adminId: string, now = new Date()) {
  const value = { adminId, at: now.toISOString() }
  await db.insert(globalSettings)
    .values({ key: KEY, value, updatedBy: adminId })
    .onConflictDoUpdate({ target: globalSettings.key, set: { value, updatedBy: adminId } })
}

export async function hasRecentReportExport(adminId: string, now = new Date()) {
  const row = await db.query.globalSettings.findFirst({ where: eq(globalSettings.key, KEY), columns: { value: true } })
  const parsed = exportSchema.safeParse(row?.value)
  if (!parsed.success || parsed.data.adminId !== adminId)
    return false
  const age = now.getTime() - Date.parse(parsed.data.at)
  return age >= 0 && age <= REPORT_VALID_MINUTES * 60 * 1000
}

// After a reset the report belongs to the year that is gone: the next reset needs a new one.
export async function clearReportExport(executor: Pick<typeof db, 'delete'> = db) {
  await executor.delete(globalSettings).where(eq(globalSettings.key, KEY))
}
