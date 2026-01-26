'use client'

import * as React from 'react'

type MaintenanceBlockProps = {
  message?: string | null
}

export function MaintenanceBlock({ message }: MaintenanceBlockProps) {
  return (
    <div className='flex-1 px-4'>
      <div className='container mx-auto max-w-6xl py-10'>
        <div className='rounded-lg border bg-muted/40 p-6'>
          <h1 className='text-xl font-semibold'>
            Servizio temporaneamente non disponibile
          </h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            {message ||
              'Il servizio è temporaneamente non disponibile. Riprova più tardi.'}
          </p>
        </div>
      </div>
    </div>
  )
}
