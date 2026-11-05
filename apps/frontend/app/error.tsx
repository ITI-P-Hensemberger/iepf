'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-8 py-10 flex flex-col items-center text-center'>
        <p className='mt-10 text-sm uppercase tracking-[0.3em] text-muted-foreground'>
          Errore
        </p>
        <h1 className='mt-2 text-2xl font-semibold'>Qualcosa è andato storto</h1>
        <p className='mt-3 max-w-md text-muted-foreground'>
          Non è stato possibile mostrare la pagina. Riprova tra qualche istante.
        </p>
        <Button className='mt-6' onClick={reset}>
          Riprova
        </Button>
      </div>
    </main>
  )
}
