import { Suspense } from 'react'

import ResetPasswordPage from '@/components/reset-password-page'

export default function ResetPasswordRoute() {
  return (
    <Suspense fallback={<main className='flex-1' />}>
      <ResetPasswordPage />
    </Suspense>
  )
}
