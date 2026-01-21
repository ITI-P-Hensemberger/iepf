// Purpose: Tutor weekday availability router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './tutor-weekday-availability.handlers'
import * as routes from './tutor-weekday-availability.routes'

const router = createRouter()

router.use('/tutors', authenticate())
router.use('/tutors/*', authenticate())

router.openapi(routes.getWeekdayAvailability, handlers.getWeekdayAvailability)
router.openapi(routes.updateWeekdayAvailability, handlers.updateWeekdayAvailability)

export default router
