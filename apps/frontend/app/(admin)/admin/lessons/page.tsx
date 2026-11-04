import { Suspense } from 'react'

import AdminLessonsPage from '@/components/admin-lessons-page'

export default function AdminLessonsRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <AdminLessonsPage />
    </Suspense>
  )
}
