// Purpose: Lesson booking router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './lessons.handlers'
import * as routes from './lessons.routes'

const router = createRouter()

router.use('/lessons', authenticate())
router.use('/lessons/*', authenticate())

router.openapi(routes.listLessons, handlers.listLessons)
router.openapi(routes.listMyLessons, handlers.listMyLessons)
router.openapi(routes.listAvailableLessons, handlers.listAvailableLessons)
router.openapi(routes.getAvailableSummary, handlers.getAvailableSummary)
router.openapi(routes.listSchedule, handlers.listSchedule)
router.openapi(routes.getLesson, handlers.getLesson)
router.openapi(routes.listLessonBookings, handlers.listLessonBookings)
router.openapi(routes.bookGeneratedLesson, handlers.bookGeneratedLesson)
router.openapi(routes.createLesson, handlers.createLesson)
router.openapi(routes.cancelBooking, handlers.cancelBooking)
router.openapi(routes.cancelLesson, handlers.cancelLesson)
router.openapi(routes.updateLessonCounts, handlers.updateLessonCounts)
router.openapi(routes.rescheduleLesson, handlers.rescheduleLesson)
router.openapi(routes.setBookingPresence, handlers.setBookingPresence)
router.openapi(routes.updateBookingTopic, handlers.updateBookingTopic)
router.openapi(routes.updateBookingCounts, handlers.updateBookingCounts)

export default router
