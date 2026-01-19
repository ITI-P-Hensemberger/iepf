import FAQ from '@/components/faq'
import { Button } from '@/components/ui/button'
import Link from 'next/dist/client/link'
import Image from 'next/image'

export default function FAQPage() {
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-8 py-10 flex flex-col items-center'>
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
        <h1 className='mt-6 text-2xl font-bold'>Domande Frequenti (FAQ)</h1>
        <p>
          Se hai altre domande, contattaci a{' '}
          <Link href='mailto:iepf@hensemberger.it' className='underline'>
            iepf@hensemberger.it
          </Link>
          .
        </p>
        <div className='mt-4 w-full max-w-3xl'>
          <FAQ />
        </div>
      </div>
    </main>
  )
}
