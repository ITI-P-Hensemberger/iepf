import Image from 'next/image'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className='min-h-screen flex items-center'>
      <div className='container mx-auto px-4 py-8 flex flex-col items-center text-center'>
        <Image
          src='/logo.png'
          alt='IEPF Logo'
          width={180}
          height={37}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
        <p className='mt-10 text-sm uppercase tracking-[0.3em] text-muted-foreground'>
          Errore 404
        </p>
        <h1 className='mt-2 text-3xl font-semibold'>Pagina non trovata</h1>
        <p className='mt-3 max-w-md text-muted-foreground'>
          Il link potrebbe essere errato o la pagina non esiste più.
        </p>
        <Button asChild className='mt-6'>
          <Link href='/'>Torna alla home</Link>
        </Button>
      </div>
    </main>
  )
}
