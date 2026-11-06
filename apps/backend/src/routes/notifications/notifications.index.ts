// Purpose: Push notification router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'
import { rateLimit } from '@/middlewares/rate-limit'

import * as handlers from './notifications.handlers'
import * as routes from './notifications.routes'

const router = createRouter()

router.use('/notifications/*', authenticate())
// One email every 10 minutes per user: enough to retry, too few to flood an inbox.
router.use('/notifications/push/setup-link', rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1,
  keyPrefix: 'push-setup-link',
  discriminator: async c => c.get('currentUser')?.id ?? null
}))

router.openapi(routes.getPushConfig, handlers.getPushConfig)
router.openapi(routes.subscribe, handlers.subscribe)
router.openapi(routes.unsubscribe, handlers.unsubscribe)
router.openapi(routes.getPreferences, handlers.getPreferences)
router.openapi(routes.updatePreferences, handlers.updatePreferences)
router.openapi(routes.getDevices, handlers.getDevices)
router.openapi(routes.sendSetupLink, handlers.sendSetupLink)
router.openapi(routes.getInbox, handlers.getInbox)
router.openapi(routes.getUnread, handlers.getUnread)
router.openapi(routes.streamInbox, handlers.streamInbox)
router.openapi(routes.markAllRead, handlers.markAllRead)
router.openapi(routes.markRead, handlers.markRead)

export default router
