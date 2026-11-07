'use client'

import { UserRoundX } from 'lucide-react'

import { StatusBlock } from '@/components/status-block'

export default function AdminPendingPage() {
  return (
    <main className='flex flex-1'>
      <StatusBlock
        icon={UserRoundX}
        title='Account non attivo'
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
