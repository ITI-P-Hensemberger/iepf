import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import { MaintenanceBlock } from '@/components/maintenance-block'
import { AUTH_COOKIES } from '@/lib/auth'
import { readMaintenance } from '@/lib/maintenance'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Manutenzione - IEPF'
}

// Every page but the login and the FAQ is rewritten here while maintenance is on (see proxy.ts).
// No header, even when signed in: nothing can be done until maintenance ends. A visitor
// gets the way to the login, which stays open for the admins.
export default async function MaintenancePage() {
  const [state, cookieStore] = await Promise.all([
    readMaintenance(process.env.API_BASE_URL ?? 'http://localhost:9999'),
    cookies()
  ])
  const signedIn = Boolean(cookieStore.get(AUTH_COOKIES.access)?.value)
  return (
    <main className='flex-1'>
      <MaintenanceBlock message={state?.message} showLogin={!signedIn} />
    </main>
  )
}
