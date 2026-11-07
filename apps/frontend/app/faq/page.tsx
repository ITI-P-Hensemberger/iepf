import Image from 'next/image'
import Link from 'next/link'

import { BackButton } from '@/components/back-button'
import { EmptyState } from '@/components/empty-state'
import FAQ, { type FaqItem } from '@/components/faq'

// Read by people not signed in yet, often from the landing: its logo on top, then the usual title.
// Read at every visit: an admin's change shows at once.
export const dynamic = 'force-dynamic'

async function loadQuestions(): Promise<FaqItem[]> {
  try {
    const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:9999'
    const response = await fetch(`${apiBaseUrl}/faqs`, { cache: 'no-store' })
    return response.ok ? await response.json() : []
  }
  catch {
    return []
  }
}

export default async function FAQPage() {
  const items = await loadQuestions()
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
          </section>
          <h1 className='mt-8 text-2xl'>Domande frequenti</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Non trovi la risposta? Scrivici a{' '}
            <Link href='mailto:iepf@hensemberger.it' className='underline underline-offset-4'>
              iepf@hensemberger.it
            </Link>
            .
          </p>
          {items.length > 0 ? (
            <div className='mt-6 rounded-lg border bg-card px-4 sm:px-6'>
              <FAQ items={items} />
            </div>
          ) : (
            <EmptyState className='mt-6'>Le domande frequenti non sono disponibili in questo momento.</EmptyState>
          )}
        </div>
      </div>
    </main>
  )
}
