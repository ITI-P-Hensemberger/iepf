import Image from 'next/image'
import Link from 'next/link'

import { BackButton } from '@/components/back-button'
import FAQ from '@/components/faq'

// Read by people not signed in yet, often from the landing: the same logo and heading as there.
export default function FAQPage() {
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 pt-10 pb-16'>
        <div className='mx-auto w-full max-w-3xl'>
          <BackButton />
          <section className='mt-6 flex flex-col items-center text-center'>
            <Image
              src='/logo.png'
              alt='InsiemeÈ+Facile'
              width={112}
              height={112}
              style={{ width: 'auto', height: 'auto', maxHeight: 112 }}
              draggable={false}
              priority
            />
            <h1 className='mt-8 text-3xl font-semibold tracking-tight text-balance sm:text-4xl'>
              Domande frequenti
            </h1>
            <p className='mt-4 text-lg text-muted-foreground text-pretty'>
              Non trovi la risposta? Scrivici a{' '}
              <Link href='mailto:iepf@hensemberger.it' className='text-foreground underline underline-offset-4'>
                iepf@hensemberger.it
              </Link>
              .
            </p>
          </section>
          <div className='mt-10 rounded-lg border bg-card px-4 sm:px-6'>
            <FAQ />
          </div>
        </div>
      </div>
    </main>
  )
}
