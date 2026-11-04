import { Suspense } from 'react'

import AdminInviteSignUpPage from '@/components/admin-invite-signup-page'

export default function AdminInviteSignUpRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <AdminInviteSignUpPage />
    </Suspense>
  )
}
