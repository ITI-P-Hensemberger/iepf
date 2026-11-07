import Link from 'next/link'

import FAQ from '@/components/faq'
import { PageHeader } from '@/components/page-header'

export default function FAQPage() {
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 pt-10 pb-16'>
        <div className='mx-auto w-full max-w-3xl'>
          <PageHeader
            title='Domande frequenti'
            description={(
              <>
                Non trovi la risposta? Scrivici a{' '}
                <Link href='mailto:iepf@hensemberger.it' className='underline underline-offset-4'>
                  iepf@hensemberger.it
                </Link>
                .
              </>
            )}
          />
          <div className='mt-6 rounded-lg border bg-card px-4 sm:px-6'>
            <FAQ />
          </div>
        </div>
      </div>
    </main>
  )
}
