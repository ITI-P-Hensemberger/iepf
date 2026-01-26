// Purpose: Global settings router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './settings.handlers'
import * as routes from './settings.routes'

const router = createRouter()

router.use('/settings', authenticate())
router.use('/settings/*', authenticate())

router.openapi(routes.getAdminSettings, handlers.getAdminSettings)
router.openapi(routes.updateAdminSettings, handlers.updateAdminSettings)
router.openapi(routes.getMySettings, handlers.getMySettings)

export default router
