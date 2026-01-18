'use client'

import { useState } from 'react'

import { RegistrationForm } from '@/components/registration-form'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import Link from 'next/dist/client/link'

export default function SignUpPage() {
  const [isSuccess, setIsSuccess] = useState(false)

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
        <h1 className='mt-6 text-2xl'>Registrazione studente</h1>
        {!isSuccess && (
          <p className='mt-2 text-center max-w-md'>
            Compila il modulo sottostante per creare il tuo account studente e
            accedere alle lezioni.
          </p>
        )}
        <div className='w-full max-w-md mt-6'>
          <RegistrationForm onSuccess={() => setIsSuccess(true)} />
        </div>
      </div>
    </main>
  )
}
