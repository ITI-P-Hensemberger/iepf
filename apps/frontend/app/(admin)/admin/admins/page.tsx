import { Suspense } from 'react'

import AdminAdminsPage from '@/components/admin-admins-page'

export default function AdminAdminsRoute() {
  return (
    <Suspense
      fallback={
        <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
          Caricamento...
        </div>
      }
    >
      <AdminAdminsPage />
    </Suspense>
  )
}
