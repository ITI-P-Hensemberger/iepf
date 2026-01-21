'use client'

import Image from 'next/image'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { logout } from '@/lib/auth-client'

export default function AdminPendingPage() {
  async function handleLogout() {
    await logout()
    // logout() handles the redirect to /auth/login
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
        <Card className='mt-6 w-full max-w-2xl'>
          <CardHeader className='text-center'>
            <CardTitle>Account non attivo</CardTitle>
            <CardDescription>
              Il tuo account non è ancora attivo oppure è stato disattivato.
              <br />
              Riceverai una mail quando verrà attivato.
              <br />
              <span className='mt-2 block'>
                Se pensi si tratti di un errore, contatta i referenti del
                progetto.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <Separator />
            <div className='flex justify-center'>
              <Button
                variant='destructive'
                className='w-full sm:w-auto cursor-pointer'
                onClick={handleLogout}
              >
                Esci
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
