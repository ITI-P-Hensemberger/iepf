// Purpose: Tutor availability router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './tutor-availability.handlers'
import * as routes from './tutor-availability.routes'

const router = createRouter()

router.use('/tutors', authenticate())
router.use('/tutors/*', authenticate())

router.openapi(routes.listAvailability, handlers.listAvailability)
router.openapi(routes.listAvailableSlots, handlers.listAvailableSlots)
router.openapi(routes.createAvailability, handlers.createAvailability)
router.openapi(routes.deleteAvailability, handlers.deleteAvailability)

export default router
