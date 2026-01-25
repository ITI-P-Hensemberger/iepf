import { Suspense } from 'react'

import TutorLessonsPage from '@/components/tutor-lessons-page'

export default function TutorLessonsRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <TutorLessonsPage />
    </Suspense>
  )
}
