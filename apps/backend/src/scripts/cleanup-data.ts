// Purpose: Scheduled job that applies the data retention rules.
import { closeDb } from '@/db'
import { cleanUpExpiredData } from '@/lib/data-retention'

cleanUpExpiredData()
  .then((deleted) => {
    process.stdout.write(`Deleted: ${JSON.stringify(deleted)}\n`)
  })
  .catch((error) => {
    console.error('Failed to clean up data:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
