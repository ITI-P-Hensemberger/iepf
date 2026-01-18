'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { logout } from '@/lib/auth-client'
import Link from 'next/link'

export default function PendingPage() {
  const router = useRouter()

  useEffect(() => {
    let isMounted = true

    async function checkStatus() {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' })
        if (!response.ok) {
          router.replace('/')
          return
        }
        const profile = (await response.json()) as {
          role?: string | null
          isActive?: boolean
        } | null
        if (!isMounted) {
          return
        }
        if (!profile) {
          router.replace('/')
          return
        }
        if (profile.role === 'admin' || profile.isActive === true) {
          router.replace('/dashboard')
        }
      } catch (error) {
        if (!isMounted) {
          return
        }
      }
    }

    void checkStatus()

    return () => {
      isMounted = false
    }
  }, [router])

  async function handleLogout() {
    await logout()
    router.replace('/')
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-8 py-10 flex flex-col items-center'>
        <Image
          src='/logo.png'
          alt='IEPF Logo'
          width={125}
          height={125}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
        <h1 className='mt-6 text-2xl'>Account in attesa</h1>
        <p className='mt-2 text-center max-w-md text-muted-foreground'>
          Il tuo account non è ancora attivo.
          <br />
          Ti avviseremo via mail quando sarà pronto.
        </p>
        <div className='mt-6'>
          Se non lo hai ancora fatto:
          <ol className='list-decimal list-inside mt-2 space-y-4'>
            <li>
              Scarica il documento di liberatoria e regolamento inviato via
              circolare.
              <br />
              Un genitore/tutore deve firmarlo -{' '}
              <strong>
                la firma della liberatoria è condizione indispensabile per la
                partecipazione.
              </strong>
            </li>
            <li>
              Riceverai l'avviso di pagamento di €50,00 dalla Segreteria
              Scolastica.
            </li>
            <li>
              Attivazione: Compila e allega la ricevuta di pagamento e la
              liberatoria firmata al seguente form:{' '}
              <Link
                href='https://forms.gle/QMBZ2HXbSryjnVuv8'
                target='_blank'
                className='underline'
              >
                Form di attivazione
              </Link>
              .
              <br />
              Una volta che la liberatoria e la ricevuta di pagamento saranno
              inviate, la segreteria procederà ad attivare l'account e potrai
              iniziare a prenotare le lezioni.
            </li>
          </ol>
        </div>
        <Button className='mt-6' onClick={handleLogout}>
          Esci
        </Button>
      </div>
    </main>
  )
}
