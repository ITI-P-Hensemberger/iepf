import FAQ from '@/components/faq'
import Image from 'next/image'

export default function FAQPage() {
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
        <h1 className='mt-6 text-3xl font-bold'>Domande Frequenti (FAQ)</h1>
        <div className='mt-4 w-full max-w-3xl'>
          <FAQ />
        </div>
      </div>
    </main>
  )
}
