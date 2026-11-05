// Purpose: Send a batch of emails and fail the job when any of them is lost.
import type { MailPayload } from './mailer'

import { sendMail } from './mailer'

export type MailBatch = ReturnType<typeof createMailBatch>

export function createMailBatch(send: (payload: MailPayload) => Promise<void> = sendMail) {
  const tasks: Array<Promise<boolean>> = []

  return {
    send(payload: MailPayload, onFailed?: () => Promise<void>) {
      // Catch here: tasks can settle long before finish() awaits them.
      tasks.push(send(payload).then(() => true, async (error) => {
        console.error('Failed to send email:', error)
        await onFailed?.().catch(cleanupError => console.error('Failed to undo email:', cleanupError))
        return false
      }))
    },
    async finish() {
      const results = await Promise.all(tasks)
      const failed = results.filter(sent => !sent).length
      if (failed > 0) {
        throw new Error(`${failed} of ${results.length} emails could not be sent`)
      }
    }
  }
}
