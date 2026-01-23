'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { AdminRegistrationForm } from '@/components/admin-registration-form'

export default function AdminInviteSignUpPage() {
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
        <div className='mt-6 flex space-x-4'>
          <Button asChild variant='outline'>
            <Link href='/'>Torna alla Home</Link>
          </Button>
        </div>
        <h1 className='mt-6 text-2xl'>Registrazione admin</h1>
        {!isSuccess && !isTokenMissing && (
          <p className='mt-2 text-center max-w-md'>
            Completa la registrazione per attivare il tuo account admin.
          </p>
        )}
        {!isTokenMissing && (
          <div className='w-full max-w-md mt-6'>
            <AdminRegistrationForm
              token={token}
              onSuccess={() => setIsSuccess(true)}
            />
          </div>
        )}
      </div>
    </main>
  )
}
