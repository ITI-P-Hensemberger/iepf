'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { logout } from '@/lib/auth-client'

export default function AdminPage() {
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
        <h1 className='mt-6 text-2xl'>Admin</h1>
        <p className='mt-2 text-center max-w-md text-muted-foreground'>
          Area amministrativa riservata.
        </p>
        <Button className='mt-6' onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </main>
  )
}
