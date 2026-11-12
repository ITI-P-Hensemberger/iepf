// Purpose: Server entrypoint that starts the Hono app.
// Must come first: in local development it can move the clock before anything reads it.
import './lib/fake-clock'
import { serve } from '@hono/node-server'

import app from './app'
import { closeDb } from './db'
import env from './env'
import { waitForPendingCounts } from './lib/analytics'
import { createShutdown } from './lib/graceful-shutdown'
import { closeMailer, waitForPendingMail } from './lib/mailer'
import { closeNotificationStreams } from './lib/notification-stream'
import { waitForPendingPush } from './lib/push'

const port = env.PORT
// eslint-disable-next-line no-console
console.log(`Server is running at http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port
})

// Must stay below stop_grace_period in infra/deploy/compose.yaml.
const SHUTDOWN_TIMEOUT_MS = 10_000

const shutdown = createShutdown({
  timeoutMs: SHUTDOWN_TIMEOUT_MS,

  exit: code => process.exit(code),
  steps: [
    async () => {
      // Stop accepting first, then end the notification streams: server.close() waits for
      // every open response, and a stream would otherwise hold it until the timeout.
      const closed = new Promise<void>((resolve, reject) => {
        server.close(error => error
          ? reject(error)
          : resolve())
      })
      await closeNotificationStreams()
      await closed
    },
    waitForPendingMail,
    waitForPendingPush,
    // After push: each delivery adds to the count of notifications sent.
    waitForPendingCounts,
    closeMailer,
    closeDb
  ]
})

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
