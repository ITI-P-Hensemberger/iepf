'use client'

import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleX, MailCheck } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/auth-layout'
import { ResultPanel } from '@/components/result-panel'
import { apiFetch, jsonBody } from '@/lib/api-fetch'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  // The link works once: a query that never refetches sends it a single time, even when the
  // page mounts twice.
  const verify = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => apiFetch('/api/auth/verify-email/confirm', 'Verifica non riuscita.', jsonBody('POST', { token })),
    enabled: Boolean(token),
    staleTime: Infinity,
    retry: false,
    meta: { inline: true }
  })
  const status = !token || verify.isError ? 'error' : verify.isSuccess ? 'success' : 'loading'
  const message = token ? verify.error?.message : 'Token non valido o scaduto.'

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
