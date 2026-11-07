import { Suspense } from 'react'

import { PageSkeleton } from '@/components/loading'
import AdminLessonDetailsPage from '@/components/admin-lesson-details-page'

export default function AdminLessonDetailsRoute() {
  return (
    <Suspense
      fallback={
        <PageSkeleton />
      }
    >
      <AdminLessonDetailsPage />
    </Suspense>
  )
}
