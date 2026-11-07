'use client'

import * as React from 'react'

import { TriangleAlert } from 'lucide-react'

import { StatusBlock } from '@/components/status-block'
import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className='flex flex-1'>
      <StatusBlock
        icon={TriangleAlert}
        title='Qualcosa è andato storto'
        actions={<Button onClick={reset}>Riprova</Button>}
      >
        <p>Non è stato possibile mostrare la pagina. Riprova tra qualche istante.</p>
      </StatusBlock>
    </main>
  )
}
