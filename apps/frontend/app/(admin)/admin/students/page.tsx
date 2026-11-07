import { Suspense } from 'react'

import { PageSkeleton } from '@/components/loading'
import AdminStudentsPage from '@/components/admin-students-page'

export default function AdminStudentsRoute() {
  return (
    <Suspense
      fallback={
        <PageSkeleton />
      }
    >
      <AdminStudentsPage />
    </Suspense>
  )
}
