import { Suspense } from 'react'

import { PageSkeleton } from '@/components/loading'
import { TutorLessonViews } from '@/components/lesson-views'

export default function TutorLessonsRoute() {
  return (
    <Suspense
      fallback={
        <PageSkeleton />
      }
    >
      <TutorLessonViews />
    </Suspense>
  )
}
