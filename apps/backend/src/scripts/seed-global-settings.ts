// Purpose: Seed initial global settings for maintenance and service messages.
import db from '@/db'
import { globalSettings } from '@/db/schemas/global-settings.schema'

const maintenanceDefault = {
  enabled: false,
  message: null,
  roles: ['student', 'tutor', 'admin', 'activator']
}

const serviceMessagesDefault = {}
const closureDatesDefault: string[] = []

async function main() {
  const admin = await db.query.users.findFirst({
    where(fields, operators) {
      return operators.eq(fields.role, 'admin')
    },
    columns: { id: true }
  })

  const updatedBy = admin?.id ?? null

  await db.insert(globalSettings)
    .values([
      {
        key: 'maintenance',
        value: maintenanceDefault,
        updatedBy
      },
      {
        key: 'serviceMessages',
        value: serviceMessagesDefault,
        updatedBy
      },
      {
        key: 'closureDates',
        value: closureDatesDefault,
        updatedBy
      }
    ])
    .onConflictDoNothing({ target: globalSettings.key })

  process.stdout.write('Seeded global settings.\n')
}

main().catch((error) => {
  console.error('Failed to seed global settings.', error)
  process.exit(1)
})
