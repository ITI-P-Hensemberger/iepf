'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { logout } from '@/lib/auth-client'
import { useSession } from '@/lib/use-session'

export default function Header() {
  const router = useRouter()
  const { refresh } = useSession()

  async function handleLogout() {
    await logout()
    await refresh()
    router.replace('/')
  }

  return (
    <header className='sticky top-0 z-40 border-b bg-background/95 backdrop-blur'>
      <div className='container mx-auto flex h-14 items-center justify-between px-4'>
        <Link href='/' className='flex items-center gap-3'>
          <Image
            src='/icon.png'
            alt='IEPF Logo'
            width={26}
            height={26}
            style={{ width: 'auto', height: 'auto' }}
            draggable={false}
            priority
          />
          <span className='text-sm font-medium'>IEPF</span>
        </Link>
        <Button variant='outline' size='sm' onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  )
}
