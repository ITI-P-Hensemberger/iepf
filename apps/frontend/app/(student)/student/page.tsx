'use client'

import Link from 'next/link'
import { useSession } from '@/lib/use-session'

export default function StudentPage() {
  const { profile, isLoading: isProfileLoading } = useSession()

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='max-w-4xl mx-auto'>
          <h1 className='text-2xl font-bold mb-2'>
            {!isProfileLoading && `Bentornatə, ${profile?.firstName}`}
          </h1>
          <p className='text-muted-foreground mb-8'>
            Questa è la tua area studente.
          </p>
          <p className='mt-6 text-center text-muted-foreground'>
            Il progetto inizia il 2 febbraio.
            <br />
            A breve potrai vedere e prenotare le lezioni.
            <br />
            <br />
            Mentre aspetti, dai un&apos;occhiata alle{' '}
            <Link href='/faq' className='mt-6 text-primary underline'>
              Domande Frequenti
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  )
}
