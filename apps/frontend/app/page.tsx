import { Button } from '@/components/ui/button'
import HomepageTabs from '@/components/homepage-tabs'
import Image from 'next/image'
import Link from 'next/link'

export default function Home() {
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
        <div className='mt-6 flex space-x-4'>
          <Button asChild variant='outline'>
            <Link href='/auth/login'>Accedi</Link>
          </Button>
          <Button asChild>
            <Link href='/auth/sign-up'>Registrati</Link>
          </Button>
        </div>
        <HomepageTabs />
      </div>
    </main>
  )
}
