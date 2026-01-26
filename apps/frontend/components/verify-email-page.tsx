'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'

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
          setMessage('Email verificata con successo.')
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

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <Image
          src='/logo.png'
          alt='IEPF Logo'
          width={125}
          height={125}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
        <h1 className='mt-6 text-2xl'>Verifica email</h1>
        <div className='w-full max-w-md mt-6'>
          <Card>
            <CardContent className='pt-6'>
              {status === 'loading' && (
                <p className='text-center text-sm text-muted-foreground'>
                  Verifica in corso...
                </p>
              )}
              {status === 'success' && message && (
                <div className='rounded-lg border border-emerald-200/70 bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-700'>
                  {message}
                </div>
              )}
              {status === 'error' && message && (
                <div className='rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive'>
                  {message}
                </div>
              )}
            </CardContent>
            <CardFooter className='justify-center'>
              {(status === 'success' || status === 'error') && (
                <Button asChild>
                  <Link href='/auth/login'>Vai al login</Link>
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </main>
  )
}
