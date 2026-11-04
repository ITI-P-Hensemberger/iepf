// Purpose: Feedback route wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './feedback.handlers'
import * as routes from './feedback.routes'

const router = createRouter()

// Routers are mounted at '/': a '*' middleware here would also guard later public routes.
router.use('/feedback', authenticate())
router.use('/feedback/*', authenticate())
router.use('/lessons/:lessonId/feedback', authenticate())
router.use('/lessons/:lessonId/feedback/*', authenticate())

router.openapi(routes.createLessonFeedback, handlers.createLessonFeedback)
router.openapi(routes.updateLessonFeedback, handlers.updateLessonFeedback)
router.openapi(routes.listMyFeedback, handlers.listMyFeedback)
router.openapi(routes.adminListFeedback, handlers.adminListFeedback)
router.openapi(routes.adminGetFeedback, handlers.adminGetFeedback)
router.openapi(routes.adminCreateFeedback, handlers.adminCreateFeedback)
router.openapi(routes.adminUpdateFeedback, handlers.adminUpdateFeedback)
router.openapi(routes.adminDeleteFeedback, handlers.adminDeleteFeedback)

export default router
