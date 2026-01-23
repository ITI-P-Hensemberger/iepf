'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'

type VerifyStatus = 'idle' | 'loading' | 'success' | 'error'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<VerifyStatus>('idle')

  useEffect(() => {
    let isMounted = true

    async function verifyEmail() {
      if (!token) {
        setStatus('error')
        toast.error('Token non valido o scaduto.')
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
          toast.success('Email verificata con successo.')
        }
      } catch {
        if (isMounted) {
          setStatus('error')
          toast.error('Verifica non riuscita.')
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
