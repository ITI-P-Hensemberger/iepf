'use client'

import { useEffect, useState } from 'react'
import { CircleCheck, CircleX, MailCheck } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/auth-layout'
import { ResultPanel } from '@/components/result-panel'

type VerifyStatus = 'idle' | 'loading' | 'success' | 'error'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<VerifyStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function verifyEmail() {
      if (!token) {
        setStatus('error')
        setMessage('Token non valido o scaduto.')
        return
      }

      setStatus('loading')

      try {
        const response = await fetch('/api/auth/verify-email/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ token })
        })

        if (!response.ok) {
          let errorMessage = 'Verifica non riuscita.'

          try {
            const payload = (await response.json()) as {
              message?: string
              error?: { issues?: Array<{ message?: string }> }
            }
            errorMessage =
              payload.message ??
              payload.error?.issues?.[0]?.message ??
              errorMessage
          } catch {
            errorMessage = 'Verifica non riuscita.'
          }

          throw new Error(errorMessage)
        }

        if (isMounted) {
          setStatus('success')
          setMessage('Email verificata.')
        }
      } catch {
        if (isMounted) {
          setStatus('error')
          setMessage('Verifica non riuscita.')
        }
      }
    }

    void verifyEmail()

    return () => {
      isMounted = false
    }
  }, [token])

  const login = <Button asChild><Link href='/auth/login'>Vai al login</Link></Button>

  return (
    <AuthLayout title='Verifica email'>
      {status === 'success' ? (
        <ResultPanel icon={CircleCheck} tone='success' title='Email verificata' action={login}>
          Il tuo indirizzo è confermato: ora puoi accedere.
        </ResultPanel>
      ) : status === 'error' ? (
        <ResultPanel icon={CircleX} tone='error' title='Verifica non riuscita' action={login}>
          {message} Dal login puoi chiedere un nuovo link di verifica.
        </ResultPanel>
      ) : (
        <ResultPanel icon={MailCheck} title='Verifica in corso…'>
          Un attimo, stiamo controllando il link.
        </ResultPanel>
      )}
    </AuthLayout>
  )
}
