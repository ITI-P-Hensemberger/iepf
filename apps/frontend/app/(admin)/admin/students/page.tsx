import { Suspense } from 'react'

import AdminStudentsPage from '@/components/admin-students-page'

export default function AdminStudentsRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <AdminStudentsPage />
    </Suspense>
  )
}
