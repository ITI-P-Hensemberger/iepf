import { Suspense } from 'react'

import TutorInviteSignUpPage from '@/components/tutor-invite-signup-page'

export default function TutorInviteSignUpRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <TutorInviteSignUpPage />
    </Suspense>
  )
}
