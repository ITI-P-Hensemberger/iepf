// Purpose: Tutor-subject relationship router wiring.
import { createRouter } from '@/lib/create-app'
import { authenticate } from '@/middlewares/auth'

import * as handlers from './tutor-subjects.handlers'
import * as routes from './tutor-subjects.routes'

const router = createRouter()

// All tutor-subject routes require authentication.
router.use('/tutors', authenticate())
router.use('/tutors/*', authenticate())
router.use('/subjects', authenticate())
router.use('/subjects/*', authenticate())

router.openapi(routes.listSubjectsForTutor, handlers.listSubjectsForTutor)
router.openapi(routes.listTutorsForSubject, handlers.listTutorsForSubject)
router.openapi(routes.addSubjectToTutor, handlers.addSubjectToTutor)
router.openapi(routes.removeSubjectFromTutor, handlers.removeSubjectFromTutor)

export default router
