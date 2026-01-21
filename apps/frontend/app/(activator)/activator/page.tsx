import { Suspense } from 'react'

import ActivatorStudentsPage from '@/components/activator-students-page'

export default function ActivatorStudentsRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <ActivatorStudentsPage />
    </Suspense>
  )
}
