'use client'

import * as React from 'react'

type MaintenanceBlockProps = {
  message?: string | null
}

export function MaintenanceBlock({ message }: MaintenanceBlockProps) {
  return (
    <div className='w-full'>
      <div className='container mx-auto px-4 py-3 flex justify-center'>
        <div className='w-full max-w-6xl rounded-lg border bg-muted/40 p-6'>
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
