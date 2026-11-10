// Purpose: Lesson chat router wiring: every route needs a signed-in user.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './lesson-messages.handlers'
import * as routes from './lesson-messages.routes'

const router = createRouter()

// Routers are mounted at '/': a '*' middleware here would also guard later public routes.
router.use('/lessons/:lessonId/bookings/:bookingId/messages', authenticate())
router.use('/lessons/:lessonId/bookings/:bookingId/messages/*', authenticate())
router.use('/lesson-messages', authenticate())

router.openapi(routes.getChat, handlers.getChat)
router.openapi(routes.sendMessage, handlers.sendMessage)
router.openapi(routes.markChatRead, handlers.markChatRead)
router.openapi(routes.listChats, handlers.listChats)

export default router
