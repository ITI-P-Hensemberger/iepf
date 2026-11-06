// Purpose: Analytics collection router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'
import { rateLimit } from '@/middlewares/rate-limit'

import * as handlers from './analytics.handlers'
import * as routes from './analytics.routes'

const router = createRouter()

router.use('/analytics/*', authenticate())
// Per account, not per IP: the whole school shares one address. A tab sends a batch about
// every 30 seconds, so this leaves room for several tabs and the service worker.
router.use('/analytics/events', rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: 'analytics',
  discriminator: async c => c.get('currentUser')?.id ?? null
}))

router.openapi(routes.collectEvents, handlers.collectEvents)

export default router
