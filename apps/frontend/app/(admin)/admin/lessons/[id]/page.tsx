import { Suspense } from 'react'

import AdminLessonDetailsPage from '@/components/admin-lesson-details-page'

export default function AdminLessonDetailsRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <AdminLessonDetailsPage />
    </Suspense>
  )
}
