'use client'

import { UserRoundX } from 'lucide-react'

import { StatusBlock } from '@/components/status-block'
import { Button } from '@/components/ui/button'
import { logout } from '@/lib/auth-client'

export default function TutorPendingPage() {
  return (
    <main className='flex flex-1'>
      <StatusBlock
        icon={UserRoundX}
        title='Account non attivo'
        actions={<>
          <Button variant='destructive' onClick={() => void logout()}>
            Esci
          </Button>
        </>}
      >
        <p>
          Il tuo account non è ancora attivo oppure è stato disattivato.
          Riceverai una mail quando verrà attivato.
        </p>
        <p className='mt-2'>
          Se pensi si tratti di un errore, contatta i referenti del progetto.
        </p>
      </StatusBlock>
    </main>
  )
}
