'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Wrench } from 'lucide-react'

import { Button } from '@/components/ui/button'

type MaintenanceBlockProps = {
  message?: string | null
  // For visitors who are not signed in: the login stays open so an admin can turn maintenance off.
  showLogin?: boolean
}

// Shown alone, without the header: nothing else on the site can be used during maintenance.
export function MaintenanceBlock({ message, showLogin = false }: MaintenanceBlockProps) {
  return (
    <div className='flex min-h-[70dvh] w-full items-center justify-center px-4 py-12'>
      <div className='flex w-full max-w-md flex-col items-center text-center'>
        <Image
          src='/logo.png'
          alt='IEPF'
          width={88}
          height={88}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
        <div className='mt-8 flex size-12 items-center justify-center rounded-full bg-muted'>
          <Wrench className='size-5 text-muted-foreground' aria-hidden />
        </div>
        <h1 className='mt-4 text-2xl font-semibold tracking-tight'>
          Siamo in manutenzione
        </h1>
        <p className='mt-3 whitespace-pre-line text-muted-foreground'>
          {message ||
            'Il servizio è temporaneamente non disponibile. Riprova più tardi.'}
        </p>
        <Button asChild variant='outline' className='mt-8'>
          <Link href='/faq'>Consulta le domande frequenti</Link>
        </Button>
        {showLogin && (
          <p className='mt-6 text-xs text-muted-foreground'>
            Sei un amministratore?{' '}
            <Link href='/auth/login' className='underline underline-offset-4'>
              Accedi
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
