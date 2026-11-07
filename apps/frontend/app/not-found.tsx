import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

import { StatusBlock } from '@/components/status-block'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className='flex flex-1'>
      <StatusBlock
        icon={FileQuestion}
        title='Pagina non trovata'
        actions={
          <Button asChild variant='outline'>
            <Link href='/'>Torna alla home</Link>
          </Button>
        }
      >
        <p>Il link potrebbe essere errato o la pagina non esiste più.</p>
      </StatusBlock>
    </main>
  )
}
