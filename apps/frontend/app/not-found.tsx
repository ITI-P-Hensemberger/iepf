import Image from 'next/image'
import { BackButton } from '@/components/back-button'

export default function NotFound() {
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-8 py-10 flex flex-col items-center text-center'>
        <div className='mb-6 self-start'>
          <BackButton />
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
        <p className='mt-10 text-sm uppercase tracking-[0.3em] text-muted-foreground'>
          Errore 404
        </p>
        <h1 className='mt-2 text-2xl font-semibold'>Pagina non trovata</h1>
        <p className='mt-3 max-w-md text-muted-foreground'>
          Il link potrebbe essere errato o la pagina non esiste più.
        </p>
      </div>
    </main>
  )
}
