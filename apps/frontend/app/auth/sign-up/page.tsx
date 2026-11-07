'use client'

import { useState } from 'react'

import { AuthLayout } from '@/components/auth-layout'
import { RegistrationForm } from '@/components/registration-form'

export default function SignUpPage() {
  const [isSuccess, setIsSuccess] = useState(false)

  return (
    <AuthLayout
      title='Registrazione studente'
      description={isSuccess ? undefined : 'Crea il tuo account per prenotare le lezioni con i tutor.'}
    >
      <RegistrationForm onSuccess={() => setIsSuccess(true)} />
    </AuthLayout>
  )
}
