import { Suspense } from 'react'

import { PageSkeleton } from '@/components/loading'
import AdminAdminsPage from '@/components/admin-admins-page'

export default function AdminAdminsRoute() {
  return (
    <Suspense
      fallback={
        <PageSkeleton />
      }
    >
      <AdminAdminsPage />
    </Suspense>
  )
}
