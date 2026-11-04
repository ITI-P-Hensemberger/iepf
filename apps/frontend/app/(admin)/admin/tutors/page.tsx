import { Suspense } from 'react'

import AdminTutorsPage from '@/components/admin-tutors-page'

export default function AdminTutorsRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <AdminTutorsPage />
    </Suspense>
  )
}
