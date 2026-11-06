'use client'

import { useState } from 'react'

import { RegistrationForm } from '@/components/registration-form'
import { BackButton } from '@/components/back-button'
import Image from 'next/image'

export default function SignUpPage() {
  const [isSuccess, setIsSuccess] = useState(false)

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='mb-6 self-start'>
          <BackButton href='/' />
        </div>
        <Image
          src='/logo.png'
          alt='IEPF Logo'
          width={125}
          height={125}
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
