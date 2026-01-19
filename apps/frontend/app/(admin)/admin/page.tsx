'use client'

import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/use-session'

export default function AdminPage() {
  const { profile, isLoading: isProfileLoading } = useSession()

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <h1 className='mt-6 text-2xl'>
          {!isProfileLoading && `Bentornato, ${profile?.firstName}`}
        </h1>
        <p className='mt-6 text-center max-w-md text-muted-foreground'>
          Gestisci gli studenti, i tutor e le lezioni.
        </p>
        <div className='mt-8'>
          <Button asChild>
            <Link href='/admin/students'>Vai alla gestione studenti</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
