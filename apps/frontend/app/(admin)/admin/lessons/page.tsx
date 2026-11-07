import { Suspense } from 'react'

import { PageSkeleton } from '@/components/loading'
import { AdminLessonViews } from '@/components/lesson-views'

export default function AdminLessonsRoute() {
  return (
    <Suspense
      fallback={
        <PageSkeleton />
      }
    >
      <AdminLessonViews />
    </Suspense>
  )
}
