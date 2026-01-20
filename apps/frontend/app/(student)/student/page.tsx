'use client'

import Link from 'next/link'
import { useSession } from '@/lib/use-session'

export default function StudentPage() {
    const { profile, isLoading: isProfileLoading } = useSession()


  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <h1 className='mt-6 text-2xl'>
          {!isProfileLoading && `Bentornato, ${profile?.firstName}`}
        </h1>
        <p className='mt-6 text-center max-w-md text-muted-foreground'>
          Questa è la tua area studente.
          <br />
          Il progetto inizia il 2 febbraio.
          <br />
          A breve qui troverai tutto ciò che riguarda le lezioni.
          <br />
          <br />
          Mentre aspetti, dai un'occhiata alle{' '}
          <Link href='/faq' className='mt-6 text-primary underline'>
            Domande Frequenti
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
