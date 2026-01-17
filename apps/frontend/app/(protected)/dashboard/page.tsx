'use client'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { logout } from '@/lib/auth-client'
import Link from 'next/link'
import Image from 'next/image'

export default function DashboardPage() {
  const router = useRouter()

  async function handleLogout() {
    await logout()
    router.replace('/')
  }

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
        <p className='mt-6 text-center max-w-md text-muted-foreground'>
          Questa è la tua dashboard.
          <br />A breve qui troverai tutto ciò che riguarda le lezioni.
          <br />
          <br />
          Il progetto verrà avviato il 2 febbraio.
          <br />
          Mentre aspetti, dai un'occhiata alle{' '}
          <Link href='/faq' className='mt-6 text-primary underline'>
            Domande Frequenti
          </Link>
          .
        </p>
        <Button className='mt-6' onClick={handleLogout}>
          Esci
        </Button>
      </div>
    </main>
  )
}
