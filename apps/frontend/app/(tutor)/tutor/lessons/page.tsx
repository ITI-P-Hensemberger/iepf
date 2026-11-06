import { Suspense } from 'react'

import { TutorLessonViews } from '@/components/lesson-views'

export default function TutorLessonsRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <TutorLessonViews />
    </Suspense>
  )
}
