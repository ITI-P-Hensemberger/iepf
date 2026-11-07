import { Suspense } from 'react'

import { PageSkeleton } from '@/components/loading'
import TutorInviteSignUpPage from '@/components/tutor-invite-signup-page'

export default function TutorInviteSignUpRoute() {
  return (
    <Suspense
      fallback={
        <PageSkeleton />
      }
    >
      <TutorInviteSignUpPage />
    </Suspense>
  )
}
