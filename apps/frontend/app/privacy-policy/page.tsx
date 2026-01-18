import { Button } from '@/components/ui/button'
import Image from 'next/image'
import Link from 'next/link'

export default function PrivacyPolicyPage() {
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <Image
          src='/logo.png'
          alt='IEPF Logo'
          width={125}
          height={125}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
        <div className='mt-6 flex space-x-4'>
          <Button asChild variant='outline'>
            <Link href='/'>Torna alla Home</Link>
          </Button>
        </div>
        <div className='text-center mt-10 max-w-3xl'>
          <h1 className='text-2xl font-bold'>Informativa sulla Privacy</h1>
          <p className='mt-2'>WIP</p>
        </div>
      </div>
    </main>
  )
}
