import { Suspense } from 'react'

import { PageSkeleton } from '@/components/loading'
import AdminTutorsPage from '@/components/admin-tutors-page'

export default function AdminTutorsRoute() {
  return (
    <Suspense
      fallback={
        <PageSkeleton />
      }
    >
      <AdminTutorsPage />
    </Suspense>
  )
}
