// Purpose: Push notification router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './notifications.handlers'
import * as routes from './notifications.routes'

const router = createRouter()

router.use('/notifications/*', authenticate())

router.openapi(routes.getPushConfig, handlers.getPushConfig)
router.openapi(routes.subscribe, handlers.subscribe)
router.openapi(routes.unsubscribe, handlers.unsubscribe)
router.openapi(routes.getPreferences, handlers.getPreferences)
router.openapi(routes.updatePreferences, handlers.updatePreferences)

export default router
