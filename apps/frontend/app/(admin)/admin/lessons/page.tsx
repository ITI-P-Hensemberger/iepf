import { Suspense } from 'react'

import { AdminLessonViews } from '@/components/lesson-views'

export default function AdminLessonsRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <AdminLessonViews />
    </Suspense>
  )
}
