// Purpose: Lesson booking router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './lessons.handlers'
import * as routes from './lessons.routes'

const router = createRouter()

router.use('/tutors', authenticate())
router.use('/tutors/*', authenticate())
router.use('/lessons', authenticate())
router.use('/lessons/*', authenticate())

router.openapi(routes.listLessons, handlers.listLessons)
router.openapi(routes.bookGeneratedLesson, handlers.bookGeneratedLesson)
router.openapi(routes.bookLesson, handlers.bookLesson)
router.openapi(routes.cancelBooking, handlers.cancelBooking)
router.openapi(routes.cancelLesson, handlers.cancelLesson)
router.openapi(routes.listLessonConfirmations, handlers.listLessonConfirmations)
router.openapi(routes.getLessonConfirmations, handlers.getLessonConfirmations)
router.openapi(routes.resolveLesson, handlers.resolveLesson)
router.openapi(routes.rescheduleLesson, handlers.rescheduleLesson)
router.openapi(routes.overrideLessonConfirmations, handlers.overrideLessonConfirmations)
router.openapi(routes.confirmLessonTutor, handlers.confirmLessonTutor)
router.openapi(routes.confirmLessonBooking, handlers.confirmLessonBooking)

export default router
