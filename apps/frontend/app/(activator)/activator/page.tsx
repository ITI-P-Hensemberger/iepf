import { Suspense } from 'react'

import { PageSkeleton } from '@/components/loading'
import ActivatorStudentsPage from '@/components/activator-students-page'

export default function ActivatorStudentsRoute() {
  return (
    <Suspense
      fallback={
        <PageSkeleton />
      }
    >
      <ActivatorStudentsPage />
    </Suspense>
  )
}
