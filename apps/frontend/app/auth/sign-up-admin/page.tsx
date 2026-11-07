import { Suspense } from 'react'

import { PageSkeleton } from '@/components/loading'
import AdminInviteSignUpPage from '@/components/admin-invite-signup-page'

export default function AdminInviteSignUpRoute() {
  return (
    <Suspense
      fallback={
        <PageSkeleton />
      }
    >
      <AdminInviteSignUpPage />
    </Suspense>
  )
}
