import { Suspense } from 'react'

import TutorLessonDetailsPage from '@/components/tutor-lesson-details-page'

export default function TutorLessonDetailsRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <TutorLessonDetailsPage />
    </Suspense>
  )
}
