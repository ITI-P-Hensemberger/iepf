import Link from 'next/link'
import { Link2Off } from 'lucide-react'

import { StatusBlock } from '@/components/status-block'
import { Button } from '@/components/ui/button'

// Where a short link that is wrong or switched off leads.
export default function LinkUnavailablePage() {
  return (
    <main className='flex flex-1'>
      <StatusBlock
        icon={Link2Off}
        title='Link non disponibile'
        actions={
          <Button asChild variant='outline'>
            <Link href='/'>Torna alla home</Link>
          </Button>
        }
      >
        <p>Il link è errato oppure è stato disattivato.</p>
      </StatusBlock>
    </main>
  )
}
