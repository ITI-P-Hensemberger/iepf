// Purpose: Tutor settings router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './tutor-settings.handlers'
import * as routes from './tutor-settings.routes'

const router = createRouter()

router.use('/tutors', authenticate())
router.use('/tutors/*', authenticate())

router.openapi(routes.getSettings, handlers.getSettings)
router.openapi(routes.updateSettings, handlers.updateSettings)

export default router
