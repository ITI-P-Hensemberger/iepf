import { Suspense } from 'react'

import { PageSkeleton } from '@/components/loading'
import TutorLessonDetailsPage from '@/components/tutor-lesson-details-page'

export default function TutorLessonDetailsRoute() {
  return (
    <Suspense
      fallback={
        <PageSkeleton />
      }
    >
      <TutorLessonDetailsPage />
    </Suspense>
  )
}
