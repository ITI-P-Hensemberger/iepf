// Purpose: Token adjustment router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './tokens.handlers'
import * as routes from './tokens.routes'

const router = createRouter()

router.use('/students', authenticate())
router.use('/students/*', authenticate())

router.openapi(routes.adjustTokens, handlers.adjustTokens)

export default router
