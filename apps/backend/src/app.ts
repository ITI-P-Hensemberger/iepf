// Purpose: App composition and route registration.
import configureOpenAPI from '@/lib/configure-open-api'
import createApp from '@/lib/create-app'
import audit from '@/routes/audit/audit.index'
import auth from '@/routes/auth/auth.index'
import classSections from '@/routes/class-sections/class-sections.index'
import health from '@/routes/health.route'
import lessons from '@/routes/lessons/lessons.index'
import subjects from '@/routes/subjects/subjects.index'
import tokens from '@/routes/tokens/tokens.index'
import tutorSettings from '@/routes/tutor-settings/tutor-settings.index'
import tutorSubjects from '@/routes/tutor-subjects/tutor-subjects.index'
import tutorWeekdayAvailability from '@/routes/tutor-weekday-availability/tutor-weekday-availability.index'
import users from '@/routes/users/users.index'

const app = createApp()

configureOpenAPI(app)

// Route modules to register on the app.
const routes = [
  audit,
  auth,
  classSections,
  health,
  lessons,
  subjects,
  tokens,
  tutorSettings,
  tutorSubjects,
  tutorWeekdayAvailability,
  users
] as const

routes.forEach((route) => {
  app.route('/', route)
})

export type AppType = typeof routes[number]

export default app
