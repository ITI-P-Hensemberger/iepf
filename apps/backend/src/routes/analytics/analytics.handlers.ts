// Purpose: Adds the browser's counts to the daily analytics table.
import type { AppRouteHandler } from '@/lib/types'

import { addCounts, sanitizeDetail, whoIs } from '@/lib/analytics'
import * as HttpStatusCodes from '@/lib/http-status-codes'

import type { CollectEventsRoute } from './analytics.routes'

export const collectEvents: AppRouteHandler<CollectEventsRoute> = async (c) => {
  const currentUser = c.get('currentUser')
  // An admin seeing the site as someone else is not that person using it.
  if (!currentUser || c.get('impersonation')) {
    return c.body(null, HttpStatusCodes.NO_CONTENT)
  }
  const { events } = c.req.valid('json')
  const who = await whoIs(currentUser)
  await addCounts(who, events.map(row => ({
    event: row.event,
    detail: sanitizeDetail(row.event, row.detail),
    count: row.count
  })))
  return c.body(null, HttpStatusCodes.NO_CONTENT)
}
