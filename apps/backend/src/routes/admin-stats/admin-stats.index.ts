// Purpose: Admin stats router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './admin-stats.handlers'
import * as routes from './admin-stats.routes'

const router = createRouter()

router.use('/admin/stats', authenticate())
router.use('/admin/stats/*', authenticate())

router.openapi(routes.listSubjectTutorCounts, handlers.listSubjectTutorCounts)
router.openapi(routes.listTutorLessonCounts, handlers.listTutorLessonCounts)
router.openapi(routes.listStudentLessonCounts, handlers.listStudentLessonCounts)
router.openapi(routes.getConfirmedLessonsCount, handlers.getConfirmedLessonsCount)
router.openapi(routes.getConfirmedBookingsCount, handlers.getConfirmedBookingsCount)
router.openapi(routes.getStudentStatusCounts, handlers.getStudentStatusCounts)
router.openapi(routes.getTutorStatusCounts, handlers.getTutorStatusCounts)

export default router
