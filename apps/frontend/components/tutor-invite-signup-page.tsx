'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link2Off as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'

import { AuthLayout } from '@/components/auth-layout'
import { ResultPanel } from '@/components/result-panel'
import { TutorRegistrationForm } from '@/components/tutor-registration-form'

export default function TutorInviteSignUpPage() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [isSuccess, setIsSuccess] = useState(false)

  const isTokenMissing = useMemo(() => token.length === 0, [token])

  useEffect(() => {
    if (isTokenMissing) {
      toast.error('Token mancante o non valido. Richiedi un nuovo invito.')
    }
  }, [isTokenMissing])

  return (
    <AuthLayout
      title='Registrazione tutor'
      description={isSuccess || isTokenMissing ? undefined : 'Completa la registrazione per attivare il tuo account tutor.'}
    >
      {isTokenMissing ? (
        <ResultPanel icon={LinkIcon} tone='error' title='Invito non valido'>
          Il link di invito è incompleto o scaduto. Chiedi un nuovo invito.
        </ResultPanel>
      ) : (
        <TutorRegistrationForm token={token} onSuccess={() => setIsSuccess(true)} />
      )}
    </AuthLayout>
  )
}
