'use client'

import { useState } from 'react'

import { RegistrationForm } from '@/components/registration-form'
import Image from 'next/image'

export default function SignUpPage() {
  const [isSuccess, setIsSuccess] = useState(false)

  return (
    <main className='min-h-screen flex items-center'>
      <div className='container mx-auto px-4 py-8 flex flex-col items-center'>
        <Image
          src='/logo.png'
          alt='IEPF Logo'
          width={180}
          height={37}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
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
